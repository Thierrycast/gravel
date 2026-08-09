import { OpsRunStatus, SourceProvider } from "@prisma/client"

import { markDomainSyncState } from "@/lib/admin/ops"
import { refreshDerivedCaches } from "@/lib/domain/derived"
import { projectPluggyReadModels } from "@/lib/domain/projectors"
import {
  fetchItem,
  fetchTransactionsByCursor,
  maxTransactionIdsPerRequest,
  PluggyApiError,
} from "@/lib/integrations/pluggy"
import { persistPluggyItemState } from "@/lib/pluggy-item-refresh"
import {
  ingestTransactionPayloads,
  syncAccountTransactions,
  syncPluggyData,
} from "@/lib/pluggy-sync"
import { prisma } from "@/lib/prisma"
import { publishSyncEvent } from "@/lib/sync-events"

import {
  extractCreatedAtFrom,
  parseWebhookPayload,
  type PluggyWebhookPayload,
} from "./webhook-payload"

export {
  parseWebhookPayload,
  WebhookPayloadError,
  type PluggyWebhookPayload,
} from "./webhook-payload"

// ── Despachante ─────────────────────────────────────────────────────────────

export type WebhookHandleResult = {
  event: string
  handled: boolean
  reprojected: boolean
  detail?: Record<string, unknown>
}

/**
 * A Pluggy notifica sobre **todos** os items da aplicação, inclusive os que o
 * Gravel não acompanha.
 *
 * No caso do MeuPluggy isso é rotina: a mesma conexão aparece sob mais de um
 * `itemId` (medido em 2026-08-08 — três items órfãos com contas, números e
 * saldos idênticos aos dos items locais, atualizados no mesmo minuto). Ingerir
 * o órfão **duplicaria** os lançamentos no dashboard, então o certo é ignorar.
 *
 * Antes disto, o evento estourava em `prisma.pluggyItem.update()` (P2025:
 * nenhum registro para atualizar), queimava as 5 tentativas e ficava em ERROR.
 */
async function isTrackedItem(itemId: string) {
  const item = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: itemId },
    select: { pluggyItemId: true },
  })
  return Boolean(item)
}

function ignoredUntrackedItem(
  event: string,
  itemId: string,
): WebhookHandleResult {
  console.log(
    `[webhook] ${event} para o item ${itemId}, que o Gravel não acompanha — ignorado. ` +
      "Normal com MeuPluggy, que expõe a mesma conexão sob mais de um itemId.",
  )
  return {
    event,
    handled: false,
    reprojected: false,
    detail: { itemId, reason: "item-not-tracked" },
  }
}

/**
 * Executa o efeito de um evento. Não trata idempotência nem estado da fila —
 * isso é de `processQueuedWebhookEvent`.
 */
export async function handleWebhookEvent(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  switch (payload.event) {
    case "item/created":
    case "item/updated":
    case "item/login_succeeded":
      return handleItemSynced(payload)

    case "item/error":
      return handleItemError(payload)

    case "item/waiting_user_input":
    case "item/waiting_user_action":
      return handleItemNeedsAction(payload)

    case "item/deleted":
      return handleItemDeleted(payload)

    case "transactions/created":
      return handleTransactionsCreated(payload)

    case "transactions/updated":
      return handleTransactionsUpdated(payload)

    case "transactions/deleted":
      return handleTransactionsDeleted(payload)

    case "connector/status_updated":
      return handleConnectorStatus(payload)

    default:
      // Evento novo ou de pagamentos (payment_intent/*, smart_transfer/*…):
      // registramos `all` na Pluggy de propósito, e ignorar aqui é o correto —
      // não é erro, então nada de 5xx nem retry.
      return { event: payload.event, handled: false, reprojected: false }
  }
}

/**
 * A Pluggy recomenda: ao receber evento de item, o primeiro passo é
 * `GET /items/{id}` — o payload do evento não é fonte de verdade.
 */
async function handleItemSynced(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const itemId = payload.itemId
  if (!itemId) {
    return { event: payload.event, handled: false, reprojected: false }
  }
  if (!(await isTrackedItem(itemId))) {
    return ignoredUntrackedItem(payload.event, itemId)
  }

  const item = (await fetchItem(itemId)) as Record<string, unknown> | null
  await persistPluggyItemState(itemId, item, { syncError: null })

  // `item/login_succeeded` só diz que o login passou — a coleta ainda está
  // rodando, então não vale reler dados agora; o `item/updated` vem depois.
  if (payload.event === "item/login_succeeded") {
    publishSyncEvent({
      type: "item:updated",
      source: "pluggy-webhook",
      itemId,
      message: "Login na instituição concluído, coletando dados…",
    })
    return {
      event: payload.event,
      handled: true,
      reprojected: false,
      detail: { status: item?.status ?? null },
    }
  }

  const summary = await syncPluggyData({ itemId })
  const reprojected = await reprojectPluggy()
  await persistPluggyItemState(itemId, item, { completed: true, syncError: null })

  // Enriquecimento (recorrências + comportamento) é best-effort e não pode
  // atrasar nem derrubar o processamento do evento.
  void import("@/lib/domain/enrichment/pluggy-item")
    .then(({ runItemEnrichment }) => runItemEnrichment(itemId))
    .catch((error) =>
      console.warn(
        `[webhook] enrichment falhou para ${itemId}: ${error instanceof Error ? error.message : error}`,
      ),
    )

  publishSyncEvent({
    type: "item:updated",
    source: "pluggy-webhook",
    itemId,
    message: "Dados atualizados pela instituição.",
    data: { inserted: summary.inserted },
  })

  return {
    event: payload.event,
    handled: true,
    reprojected,
    detail: { inserted: summary.inserted },
  }
}

async function handleItemError(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const itemId = payload.itemId
  if (!itemId) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  if (!(await isTrackedItem(itemId))) {
    return ignoredUntrackedItem(payload.event, itemId)
  }

  const item = (await fetchItem(itemId).catch(() => null)) as Record<
    string,
    unknown
  > | null
  const message =
    payload.error?.message ??
    payload.error?.code ??
    "A instituição recusou a sincronização."

  await persistPluggyItemState(itemId, item, { syncError: message })

  publishSyncEvent({
    type: "sync:error",
    source: "pluggy-webhook",
    itemId,
    message,
    data: { code: payload.error?.code ?? null },
  })

  await notifyItemProblem(itemId, message)

  return {
    event: payload.event,
    handled: true,
    reprojected: false,
    detail: { code: payload.error?.code ?? null },
  }
}

async function handleItemNeedsAction(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const itemId = payload.itemId
  if (!itemId) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  if (!(await isTrackedItem(itemId))) {
    return ignoredUntrackedItem(payload.event, itemId)
  }

  const item = (await fetchItem(itemId).catch(() => null)) as Record<
    string,
    unknown
  > | null
  const message =
    payload.event === "item/waiting_user_action"
      ? "O banco pediu que você aprove o acesso no app dele."
      : "O banco pediu autenticação adicional (MFA). Reconecte para continuar."

  await persistPluggyItemState(itemId, item, { syncError: message })

  publishSyncEvent({
    type: "item:needs_action",
    source: "pluggy-webhook",
    itemId,
    message,
  })

  await notifyItemProblem(itemId, message)

  return { event: payload.event, handled: true, reprojected: false }
}

async function handleItemDeleted(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const itemId = payload.itemId
  if (!itemId) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  // Não apagamos os dados já ingeridos: o histórico continua válido para
  // relatórios. Só marcamos que a conexão não existe mais na Pluggy.
  await prisma.pluggyItem
    .update({
      where: { pluggyItemId: itemId },
      data: {
        deletedAt: new Date(),
        status: "DELETED",
        syncError: "Conexão removida na Pluggy. Reconecte para voltar a sincronizar.",
      },
    })
    .catch(() => {
      // Item pode nunca ter existido localmente.
    })

  publishSyncEvent({
    type: "item:needs_action",
    source: "pluggy-webhook",
    itemId,
    message: "Conexão removida na Pluggy.",
  })

  return { event: payload.event, handled: true, reprojected: false }
}

/**
 * `transactions/created` traz `accountId` e `transactionsCreatedAtFrom` — dá
 * para buscar exatamente o lote novo, sem reler a conta inteira.
 */
async function handleTransactionsCreated(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const accountId = payload.accountId
  const itemId = payload.itemId ?? (await resolveItemIdForAccount(accountId))
  if (!accountId || !itemId) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  const createdAtFrom =
    payload.transactionsCreatedAtFrom ??
    extractCreatedAtFrom(payload.createdTransactionsLinkV2) ??
    extractCreatedAtFrom(payload.createdTransactionsLink)

  const result = await syncAccountTransactions({
    itemId,
    accountId,
    accountCurrencyCode: await resolveAccountCurrency(accountId),
    createdAtFrom,
  })

  const reprojected = await reprojectPluggy()

  publishSyncEvent({
    type: "transactions:changed",
    source: "pluggy-webhook",
    itemId,
    message: `${result.processed} lançamento(s) novo(s).`,
    data: { accountId, processed: result.processed },
  })

  return {
    event: payload.event,
    handled: true,
    reprojected,
    detail: { accountId, ...result, watermark: result.watermark.toISOString() },
  }
}

/**
 * `transactions/updated` manda só os ids. A Pluggy recomenda reler o dado
 * completo pelo parâmetro `ids` (máx. 500 por chamada).
 */
async function handleTransactionsUpdated(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const accountId = payload.accountId
  const itemId = payload.itemId ?? (await resolveItemIdForAccount(accountId))
  if (!accountId || !itemId || payload.transactionIds.length === 0) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  const accountCurrencyCode = await resolveAccountCurrency(accountId)
  let processed = 0
  let inserted = 0
  const skipped: string[] = []

  const ingest = async (transactions: Record<string, unknown>[]) => {
    const result = await ingestTransactionPayloads({
      itemId,
      accountId,
      accountCurrencyCode,
      transactions,
    })
    processed += result.processed
    inserted += result.inserted
  }

  for (
    let index = 0;
    index < payload.transactionIds.length;
    index += maxTransactionIdsPerRequest
  ) {
    const chunk = payload.transactionIds.slice(
      index,
      index + maxTransactionIdsPerRequest,
    )
    const chunkSkipped = await fetchIdsResilient(
      accountId,
      chunk,
      ingest,
    )
    skipped.push(...chunkSkipped)
  }

  const reprojected = await reprojectPluggy()

  publishSyncEvent({
    type: "transactions:changed",
    source: "pluggy-webhook",
    itemId,
    message: `${processed} lançamento(s) corrigido(s) pela instituição.`,
    data: { accountId, processed },
  })

  return {
    event: payload.event,
    handled: true,
    reprojected,
    detail: { accountId, processed, inserted, skipped: skipped.length },
  }
}

/**
 * Busca transações por `ids` tolerando id que a Pluggy não resolve.
 *
 * O `GET /v2/transactions?ids=` responde **400 para o lote inteiro** se um único
 * id não existir (ou não pertencer à conta) — medido em 2026-08-08. E 400 é
 * definitivo, sem retry. Um id obsoleto no evento (transação atualizada e depois
 * removida, por exemplo) descartaria todas as correções do lote.
 *
 * Bisecção: em caso de 400, divide o lote pela metade e tenta de novo, até
 * isolar e pular só os ids ruins. Custo O(log n) por id problemático, em vez de
 * uma chamada por id.
 */
async function fetchIdsResilient(
  accountId: string,
  ids: string[],
  ingest: (transactions: Record<string, unknown>[]) => Promise<void>,
): Promise<string[]> {
  if (ids.length === 0) return []

  try {
    let after: string | null = null
    do {
      const page = await fetchTransactionsByCursor({ accountId, ids, after })
      await ingest(page.results)
      after = page.next
    } while (after)
    return []
  } catch (error) {
    const isBadRequest =
      error instanceof PluggyApiError && error.statusCode === 400
    if (!isBadRequest) throw error

    // Um id só: é ele o problema — pula e segue.
    if (ids.length === 1) {
      console.warn(
        `[webhook] transação ${ids[0]} não pôde ser lida (a Pluggy não a resolve); ignorada.`,
      )
      return ids
    }

    const middle = Math.floor(ids.length / 2)
    const left = await fetchIdsResilient(accountId, ids.slice(0, middle), ingest)
    const right = await fetchIdsResilient(accountId, ids.slice(middle), ingest)
    return [...left, ...right]
  }
}

/**
 * `transactions/deleted`: a instituição desfez lançamentos (comum quando uma
 * fatura fecha e a prévia é substituída). O projetor é aditivo — ele nunca
 * remove read models órfãos — então a remoção tem de ser explícita aqui.
 */
async function handleTransactionsDeleted(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const ids = payload.transactionIds
  if (ids.length === 0) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  const sources = await prisma.domainTransactionSource.findMany({
    where: { sourceProvider: SourceProvider.PLUGGY, sourceExternalId: { in: ids } },
    select: { id: true, domainTransactionId: true },
  })
  const domainTransactionIds = [
    ...new Set(sources.map((source) => source.domainTransactionId)),
  ]

  const removed = await prisma.$transaction(async (tx) => {
    const records = await tx.pluggyTransactionRecord.deleteMany({
      where: { externalId: { in: ids } },
    })
    await tx.domainTransactionSource.deleteMany({
      where: { id: { in: sources.map((source) => source.id) } },
    })
    const domain = await tx.domainTransaction.deleteMany({
      where: { id: { in: domainTransactionIds } },
    })
    return { records: records.count, domain: domain.count }
  })

  const reprojected = await reprojectPluggy()

  publishSyncEvent({
    type: "transactions:changed",
    source: "pluggy-webhook",
    itemId: payload.itemId ?? undefined,
    message: `${removed.domain} lançamento(s) removido(s) pela instituição.`,
    data: { removed },
  })

  return { event: payload.event, handled: true, reprojected, detail: removed }
}

async function handleConnectorStatus(
  payload: PluggyWebhookPayload,
): Promise<WebhookHandleResult> {
  const connectorId = Number.parseInt(payload.connectorId ?? "", 10)
  const status = payload.data?.status
  if (!Number.isFinite(connectorId) || !status) {
    return { event: payload.event, handled: false, reprojected: false }
  }

  const name = await prisma.pluggyItem
    .findFirst({ where: { connectorId }, select: { connectorName: true } })
    .then((item) => item?.connectorName ?? null)

  await prisma.pluggyConnectorStatus.upsert({
    where: { connectorId },
    update: { status, name, observedAt: new Date() },
    create: { connectorId, status, name },
  })

  publishSyncEvent({
    type: "connector:status",
    source: "pluggy-webhook",
    message: `${name ?? `Conector ${connectorId}`}: ${status}`,
    data: { connectorId, status },
  })

  return {
    event: payload.event,
    handled: true,
    reprojected: false,
    detail: { connectorId, status },
  }
}

// ── Fila durável ────────────────────────────────────────────────────────────

/** Tentativas antes de desistir de um evento (a Pluggy já reenvia até 9x). */
export const MAX_WEBHOOK_ATTEMPTS = 5

/**
 * Processa um evento já persistido na fila e atualiza o estado. Idempotente:
 * um evento já `SUCCESS` é ignorado.
 */
export async function processQueuedWebhookEvent(eventRowId: string) {
  const row = await prisma.pluggyWebhookEvent.findUnique({
    where: { id: eventRowId },
  })
  if (!row) return { skipped: true, reason: "not-found" as const }
  if (row.status === OpsRunStatus.SUCCESS) {
    return { skipped: true, reason: "already-processed" as const }
  }

  await prisma.pluggyWebhookEvent.update({
    where: { id: row.id },
    data: { status: OpsRunStatus.RUNNING, attempts: { increment: 1 } },
  })

  try {
    const payload = parseWebhookPayload(JSON.parse(row.payloadJson))
    const result = await handleWebhookEvent(payload)

    await prisma.pluggyWebhookEvent.update({
      where: { id: row.id },
      data: {
        status: OpsRunStatus.SUCCESS,
        processedAt: new Date(),
        error: null,
      },
    })

    await markDomainSyncState({
      stateKey: `pluggy-webhook-${payload.event}`,
      status: OpsRunStatus.SUCCESS,
      meta: { eventId: payload.eventId, ...result },
    })

    return { skipped: false, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[webhook] ${row.event} (${row.eventId}) falhou:`, error)

    await prisma.pluggyWebhookEvent.update({
      where: { id: row.id },
      data: {
        status: OpsRunStatus.ERROR,
        error: message.slice(0, 1000),
        processedAt: new Date(),
      },
    })

    throw error
  }
}

/**
 * Reprocessa eventos que ficaram pendentes ou falharam — chamado pelo tick do
 * scheduler. Cobre o caso de o processo morrer entre o 200 e o processamento.
 */
export async function drainPendingWebhookEvents(limit = 20) {
  const pending = await prisma.pluggyWebhookEvent.findMany({
    where: {
      status: { in: [OpsRunStatus.RUNNING, OpsRunStatus.ERROR] },
      attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
    },
    orderBy: { receivedAt: "asc" },
    take: limit,
    select: { id: true },
  })

  let processed = 0
  let failed = 0
  for (const row of pending) {
    try {
      const result = await processQueuedWebhookEvent(row.id)
      if (!result.skipped) processed += 1
    } catch {
      failed += 1
    }
  }

  return { candidates: pending.length, processed, failed }
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

/**
 * Reprojeta os read models depois de mexer nos registros brutos. Se falhar, o
 * dado bruto já está salvo — o próximo sync/reconciliação reprojeta.
 */
async function reprojectPluggy() {
  try {
    await projectPluggyReadModels()
    await refreshDerivedCaches()
    return true
  } catch (error) {
    console.error("[webhook] reprojeção falhou:", error)
    return false
  }
}

async function resolveItemIdForAccount(accountId?: string | null) {
  if (!accountId) return null
  const account = await prisma.pluggyAccountRecord.findUnique({
    where: { externalId: accountId },
    select: { itemExternalId: true },
  })
  return account?.itemExternalId ?? null
}

async function resolveAccountCurrency(accountId: string) {
  const account = await prisma.pluggyAccountRecord.findUnique({
    where: { externalId: accountId },
    select: { currencyCode: true },
  })
  return account?.currencyCode ?? null
}

async function notifyItemProblem(itemId: string, message: string) {
  try {
    const { notifyPluggyItemProblem } = await import("@/lib/domain/notifications")
    await notifyPluggyItemProblem(itemId, message)
  } catch (error) {
    console.warn(
      `[webhook] notificação de problema falhou para ${itemId}: ${error instanceof Error ? error.message : error}`,
    )
  }
}
