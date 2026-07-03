import {
  fetchItem,
  PluggyApiError,
  refreshPluggyItem,
} from "@/lib/integrations/pluggy"
import { acquireSyncLock, releaseSyncLock } from "@/lib/admin/ops"
import { prisma } from "@/lib/prisma"

// executionStatus terminais da Pluggy.
const TERMINAL_OK = new Set(["SUCCESS", "PARTIAL_SUCCESS"])
const TERMINAL_ERROR = new Set([
  "ERROR",
  "INVALID_CREDENTIALS",
  "ALREADY_LOGGED_IN",
  "INVALID_CREDENTIALS_MFA",
  "ACCOUNT_LOCKED",
  "ACCOUNT_NEEDS_ACTION",
  "USER_AUTHORIZATION_PENDING",
  "USER_AUTHORIZATION_NOT_GRANTED",
  "USER_INPUT_TIMEOUT",
  "SITE_NOT_AVAILABLE",
  "CONNECTION_ERROR",
])
// Status do item (não do execution) que exigem ação do usuário via Connect.
const NEEDS_ACTION_STATUSES = new Set([
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
  "LOGIN_ERROR",
])

export type ItemRefreshOutcome =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "ERROR"
  | "NEEDS_ACTION"
  | "MFA_REQUIRED"
  | "IN_PROGRESS"
  | "RATE_LIMITED"

export type ItemRefreshResult = {
  itemId: string
  outcome: ItemRefreshOutcome
  executionStatus: string | null
  status: string | null
  message?: string
  reprojected: boolean
}

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 90_000

function classifyItem(item: Record<string, unknown> | null): {
  outcome: ItemRefreshOutcome
  terminal: boolean
} {
  const status = typeof item?.status === "string" ? item.status : null
  const execution =
    typeof item?.executionStatus === "string" ? item.executionStatus : null

  if (status && NEEDS_ACTION_STATUSES.has(status)) {
    // WAITING_USER_INPUT durante MFA vs LOGIN_ERROR (reconectar).
    if (status === "LOGIN_ERROR") return { outcome: "NEEDS_ACTION", terminal: true }
    return { outcome: "MFA_REQUIRED", terminal: true }
  }
  if (execution && TERMINAL_OK.has(execution)) {
    return {
      outcome: execution === "PARTIAL_SUCCESS" ? "PARTIAL_SUCCESS" : "SUCCESS",
      terminal: true,
    }
  }
  if (execution && TERMINAL_ERROR.has(execution)) {
    return { outcome: "ERROR", terminal: true }
  }
  return { outcome: "IN_PROGRESS", terminal: false }
}

function parseItemDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

async function persistItemState(
  itemId: string,
  item: Record<string, unknown> | null,
  extra: { syncError?: string | null; triggered?: boolean; completed?: boolean },
) {
  const status = typeof item?.status === "string" ? item.status : undefined
  const executionStatus =
    typeof item?.executionStatus === "string" ? item.executionStatus : undefined
  const statusDetail = item?.statusDetail
  // `error` do item pode ser objeto { message } ou string.
  const itemError = item?.error as { message?: string } | string | null | undefined
  const errorMessage =
    typeof itemError === "string"
      ? itemError
      : (itemError?.message ?? undefined)
  await prisma.pluggyItem
    .update({
      where: { pluggyItemId: itemId },
      data: {
        status,
        executionStatus,
        statusDetailJson: statusDetail ? JSON.stringify(statusDetail) : undefined,
        lastUpdatedAt: parseItemDate(item?.lastUpdatedAt ?? item?.updatedAt),
        consentExpiresAt: parseItemDate(item?.consentExpiresAt),
        nextAutoSyncAt: parseItemDate(item?.nextAutoSyncAt),
        syncError:
          extra.syncError === undefined
            ? errorMessage
            : (extra.syncError ?? errorMessage ?? null),
        lastSyncTriggeredAt: extra.triggered ? new Date() : undefined,
        lastSyncedAt: extra.completed ? new Date() : undefined,
      },
    })
    .catch(() => {
      // Item pode ainda não existir localmente; ignora.
    })
}

/**
 * Dispara PATCH /items/{id} e acompanha via GET /items/{id} até um estado
 * terminal (ou timeout). NÃO relê os dados do item — quem chama decide.
 * Persiste o estado no PluggyItem a cada passo. Não adquire lock (uso interno).
 */
export async function triggerAndPollItem(
  itemId: string,
  options?: {
    parameters?: Record<string, unknown>
    timeoutMs?: number
    pollIntervalMs?: number
  },
): Promise<{
  item: Record<string, unknown> | null
  outcome: ItemRefreshOutcome
  message?: string
}> {
  const timeoutMs = options?.timeoutMs ?? POLL_TIMEOUT_MS
  const pollIntervalMs = options?.pollIntervalMs ?? POLL_INTERVAL_MS

  let item: Record<string, unknown> | null
  try {
    item = (await refreshPluggyItem(
      itemId,
      options?.parameters ? { parameters: options.parameters } : undefined,
    )) as Record<string, unknown> | null
  } catch (error) {
    if (error instanceof PluggyApiError) {
      if (error.isRateLimit) {
        const current = (await fetchItem(itemId).catch(() => null)) as Record<
          string,
          unknown
        > | null
        await persistItemState(itemId, current, {
          syncError:
            "Atualização muito frequente. Tente novamente em instantes.",
        })
        return { item: current, outcome: "RATE_LIMITED", message: error.message }
      }
      // 400 credenciais/MFA, 403 consentimento → precisa reconectar.
      await persistItemState(itemId, null, { syncError: error.message })
      return {
        item: null,
        outcome: error.statusCode === 400 ? "MFA_REQUIRED" : "NEEDS_ACTION",
        message: error.message,
      }
    }
    throw error
  }

  await persistItemState(itemId, item, { triggered: true, syncError: null })

  const deadline = Date.now() + timeoutMs
  let classification = classifyItem(item)
  while (!classification.terminal && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    item = (await fetchItem(itemId).catch(() => item)) as Record<
      string,
      unknown
    > | null
    classification = classifyItem(item)
  }

  if (classification.outcome === "MFA_REQUIRED") {
    await persistItemState(itemId, item, {
      syncError:
        "O banco pediu autenticação adicional. Reconecte para continuar.",
    })
  } else if (classification.outcome === "NEEDS_ACTION") {
    await persistItemState(itemId, item, {
      syncError: "As credenciais expiraram. Reconecte a instituição.",
    })
  } else if (classification.outcome === "ERROR") {
    await persistItemState(itemId, item, {
      syncError: "A sincronização falhou na instituição.",
    })
  }

  return { item, outcome: classification.outcome }
}

/**
 * Refresh de um item de ponta a ponta: dispara PATCH, acompanha até terminal e,
 * quando sucesso/parcial, relê contas/transações/etc. do item. Um lock por
 * item evita refreshes simultâneos (debounce). Não bloqueia além do timeout.
 */
export async function refreshPluggyItemAndWait(
  itemId: string,
  options?: {
    parameters?: Record<string, unknown>
    timeoutMs?: number
    pollIntervalMs?: number
  },
): Promise<ItemRefreshResult> {
  const lockKey = `pluggy:item-refresh:${itemId}`
  let owner: string
  try {
    owner = await acquireSyncLock(lockKey, undefined, POLL_TIMEOUT_MS + 30_000)
  } catch {
    return {
      itemId,
      outcome: "IN_PROGRESS",
      executionStatus: null,
      status: null,
      message: "Sincronização já em andamento para este item.",
      reprojected: false,
    }
  }

  try {
    const { item, outcome, message } = await triggerAndPollItem(itemId, options)

    let reprojected = false
    if (outcome === "SUCCESS" || outcome === "PARTIAL_SUCCESS") {
      // Import dinâmico evita ciclo estático com pluggy-sync.
      const { syncPluggyItem } = await import("@/lib/pluggy-sync")
      await syncPluggyItem(itemId)
      reprojected = true
      await persistItemState(itemId, item, { completed: true, syncError: null })

      // Enriquecimento por item (recorrências + comportamento) em background —
      // best-effort, não trava o refresh.
      void import("@/lib/domain/enrichment/pluggy-item")
        .then(({ runItemEnrichment }) => runItemEnrichment(itemId))
        .catch((error) =>
          console.warn(
            `[item-refresh] enrichment falhou para ${itemId}: ${error instanceof Error ? error.message : error}`,
          ),
        )
    }

    return {
      itemId,
      outcome,
      executionStatus: (item?.executionStatus as string | null) ?? null,
      status: (item?.status as string | null) ?? null,
      message,
      reprojected,
    }
  } finally {
    await releaseSyncLock(lockKey, owner)
  }
}
