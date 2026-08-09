import { OpsRunStatus, Prisma, SourceProvider } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { publishSyncEvent } from "@/lib/sync-events"

import { drainPendingWebhookEvents } from "./webhook-events"
import { reconcilePluggyWebhook } from "./webhook-registry"

/**
 * Agendador in-process. Um tick curto acorda, lê a configuração do banco e
 * decide o que está vencido — assim o intervalo é editável em
 * /settings → Sincronização e passa a valer no próximo tick, sem restart.
 *
 * Por que aqui e não num cron do host: o intervalo é configurável pelo usuário,
 * e um `OnCalendar` de systemd é fixo. `POST /api/sync/cron` continua existindo
 * para quem quiser um gatilho externo.
 */

const TICK_INTERVAL_MS = 60_000

/** Cadência do saldo em tempo real — leve, não custa sync de item. */
const BALANCE_REFRESH_MS = 15 * 60 * 1000

/** Reconciliação completa (backfill de 12 meses) uma vez por dia. */
const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Um `OpsSyncRun` que passa disso em `RUNNING` está órfão — o processo morreu
 * no meio. Ficou exatamente isso travando o auto-sync por 19 dias.
 */
const RUN_STALE_MS = 30 * 60 * 1000

const DEFAULT_SYNC_INTERVAL_MINUTES = 30

export const SCHEDULER_TASKS = [
  "webhook-drain",
  "balances",
  "incremental-sync",
  "daily-reconcile",
  "consents",
] as const

export type TaskName = (typeof SCHEDULER_TASKS)[number]

export function isTaskName(value: string): value is TaskName {
  return (SCHEDULER_TASKS as readonly string[]).includes(value)
}

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null
  running: boolean
  lastRunAt: Partial<Record<TaskName, number>>
  startedAt: number | null
}

declare global {
  var gravelScheduler: SchedulerState | undefined
}

function getState(): SchedulerState {
  if (!globalThis.gravelScheduler) {
    globalThis.gravelScheduler = {
      timer: null,
      running: false,
      lastRunAt: {},
      startedAt: null,
    }
  }
  return globalThis.gravelScheduler
}

function isSchemaNotReadyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

// ── Watchdog ────────────────────────────────────────────────────────────────

/**
 * Solta runs e locks órfãos. Sem isso, um processo morto no meio de um sync
 * bloqueia todos os próximos para sempre — foi o que aconteceu entre 18/07 e
 * 07/08 de 2026.
 */
export async function runWatchdog() {
  const cutoff = new Date(Date.now() - RUN_STALE_MS)

  const staleRuns = await prisma.opsSyncRun.updateMany({
    where: { status: OpsRunStatus.RUNNING, startedAt: { lt: cutoff } },
    data: {
      status: OpsRunStatus.ERROR,
      errorMessage:
        "Run órfão: o processo terminou sem finalizar (liberado pelo watchdog).",
      finishedAt: new Date(),
    },
  })

  const staleLocks = await prisma.opsSyncLock.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })

  if (staleRuns.count > 0 || staleLocks.count > 0) {
    console.warn(
      `[scheduler] watchdog liberou ${staleRuns.count} run(s) e ${staleLocks.count} lock(s) órfãos.`,
    )
  }

  return { staleRuns: staleRuns.count, staleLocks: staleLocks.count }
}

// ── Configuração ────────────────────────────────────────────────────────────

export type SyncCadence = {
  intervalMs: number
  intervalMinutes: number
  lookbackDays: number
}

/**
 * Lê a cadência do `UserSetting`. `syncIntervalMinutes` é a fonte de verdade;
 * quando ainda está no default e havia um `syncIntervalHours` customizado
 * (config antiga, em horas), semeia a partir dele para não perder a escolha.
 */
export async function resolveSyncCadence(): Promise<SyncCadence> {
  const settings = await prisma.userSetting.findFirst({
    select: {
      id: true,
      syncIntervalMinutes: true,
      syncIntervalHours: true,
      syncLookbackDays: true,
    },
  })

  let intervalMinutes = settings?.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES

  if (
    settings &&
    settings.syncIntervalMinutes === DEFAULT_SYNC_INTERVAL_MINUTES &&
    settings.syncIntervalHours > 0 &&
    settings.syncIntervalHours !== 6
  ) {
    intervalMinutes = settings.syncIntervalHours * 60
    await prisma.userSetting.update({
      where: { id: settings.id },
      data: { syncIntervalMinutes: intervalMinutes },
    })
    console.log(
      `[scheduler] semeou syncIntervalMinutes=${intervalMinutes} a partir de syncIntervalHours=${settings.syncIntervalHours}.`,
    )
  }

  const safeMinutes = Math.max(1, intervalMinutes)

  return {
    intervalMinutes: safeMinutes,
    intervalMs: safeMinutes * 60 * 1000,
    lookbackDays: settings?.syncLookbackDays ?? 30,
  }
}

// ── Tarefas ─────────────────────────────────────────────────────────────────

async function lastSuccessfulRunAt(resource: string) {
  const run = await prisma.opsSyncRun.findFirst({
    where: {
      provider: SourceProvider.PLUGGY,
      resource,
      status: OpsRunStatus.SUCCESS,
    },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  })
  return run?.finishedAt ?? null
}

/**
 * Sync incremental de todos os items: relê apenas o que a Pluggy criou desde o
 * checkpoint de cada conta. Não dispara `PATCH` — o dado fresco vem do
 * auto-sync da Pluggy (que também aciona o webhook); isto é a rede de
 * segurança para quando um evento não chega.
 */
async function runIncrementalSync(cadence: SyncCadence) {
  const { runPluggySync } = await import("./provider-sync")
  publishSyncEvent({
    type: "sync:started",
    source: "scheduler",
    message: "Sincronização automática iniciada.",
  })

  const summary = await runPluggySync({
    scope: "scheduler/incremental",
    resource: "incremental",
    trigger: "scheduler",
    refresh: false,
    lookbackDays: cadence.lookbackDays,
  })

  publishSyncEvent({
    type: "sync:done",
    source: "scheduler",
    message: "Sincronização automática concluída.",
    data: { inserted: summary.inserted },
  })

  return summary
}

/**
 * Reconciliação diária: relê 12 meses para corrigir qualquer buraco, e atualiza
 * os produtos de perfil (identidade e consentimentos), que mudam devagar e não
 * justificam entrar no ciclo curto.
 */
async function runDailyReconcile(cadence: SyncCadence) {
  const { runPluggySync } = await import("./provider-sync")
  const summary = await runPluggySync({
    scope: "scheduler/reconcile",
    resource: "reconcile",
    trigger: "scheduler",
    refresh: false,
    full: true,
    lookbackDays: cadence.lookbackDays,
  })

  await runProfileSync().catch((error) =>
    console.warn(`[scheduler] perfis não sincronizados: ${describeError(error)}`),
  )

  publishSyncEvent({
    type: "sync:done",
    source: "scheduler",
    message: "Reconciliação diária concluída.",
    data: { inserted: summary.inserted },
  })

  return summary
}

/** Consentimento vencendo em menos disso vira notificação (uma vez por dia). */
const CONSENT_WARNING_DAYS = 15

/**
 * Identidade + consentimentos de todos os items, e aviso quando um
 * consentimento do Open Finance está perto de expirar — o usuário precisa
 * renovar antes, senão a sincronização simplesmente para.
 */
async function runProfileSync() {
  const { syncAllItemProfiles } = await import("./pluggy-profile")
  const results = await syncAllItemProfiles()

  const threshold = new Date(
    Date.now() + CONSENT_WARNING_DAYS * 24 * 60 * 60 * 1000,
  )
  const expiring = await prisma.pluggyItem.findMany({
    where: { deletedAt: null, consentExpiresAt: { not: null, lte: threshold } },
    select: { pluggyItemId: true, connectorName: true, consentExpiresAt: true },
  })

  if (expiring.length > 0) {
    const { notifyPluggyItemProblem } = await import("@/lib/domain/notifications")
    for (const item of expiring) {
      const daysLeft = Math.ceil(
        (item.consentExpiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
      )
      await notifyPluggyItemProblem(
        item.pluggyItemId,
        daysLeft <= 0
          ? "O consentimento do Open Finance expirou. Reconecte para voltar a receber dados."
          : `O consentimento do Open Finance expira em ${daysLeft} dia(s). Renove para não perder o acesso.`,
        daysLeft <= 3 ? "critical" : "warning",
      ).catch(() => {
        // Notificação é best-effort.
      })
    }

    publishSyncEvent({
      type: "item:needs_action",
      source: "scheduler",
      message: `${expiring.length} conexão(ões) com consentimento perto de expirar.`,
    })
  }

  return { items: results.length, expiringConsents: expiring.length }
}

/** Saldo em tempo real das contas Pluggy, sem custo de sync de item. */
async function runBalanceRefresh() {
  const { refreshDomainAccountBalance } = await import("@/lib/pluggy-balance")
  const accounts = await prisma.domainAccount.findMany({
    where: { sourceProvider: SourceProvider.PLUGGY },
    select: { id: true },
  })

  let refreshed = 0
  for (const account of accounts) {
    const result = await refreshDomainAccountBalance(account.id).catch(() => null)
    if (result?.ok) refreshed += 1
  }

  if (refreshed > 0) {
    publishSyncEvent({
      type: "sync:progress",
      source: "scheduler",
      message: `Saldo de ${refreshed} conta(s) atualizado.`,
    })
  }

  return { accounts: accounts.length, refreshed }
}

// ── Tick ────────────────────────────────────────────────────────────────────

function isDue(task: TaskName, intervalMs: number) {
  const last = getState().lastRunAt[task]
  return !last || Date.now() - last >= intervalMs
}

function markRan(task: TaskName) {
  getState().lastRunAt[task] = Date.now()
}

export type TickResult = {
  ran: TaskName[]
  skipped: boolean
  errors: Array<{ task: TaskName | "watchdog"; message: string }>
  detail: Record<string, unknown>
}

/**
 * Um ciclo do agendador. Idempotente e serializado: se um tick anterior ainda
 * está rodando (um sync longo), este volta na hora.
 */
export async function runSchedulerTick(options?: {
  force?: TaskName[]
}): Promise<TickResult> {
  const state = getState()
  if (state.running) {
    return { ran: [], skipped: true, errors: [], detail: { reason: "busy" } }
  }
  state.running = true

  const ran: TaskName[] = []
  const errors: TickResult["errors"] = []
  const detail: Record<string, unknown> = {}
  const forced = new Set(options?.force ?? [])

  try {
    try {
      detail.watchdog = await runWatchdog()
    } catch (error) {
      if (isSchemaNotReadyError(error)) {
        return {
          ran: [],
          skipped: true,
          errors: [],
          detail: { reason: "schema-not-ready" },
        }
      }
      errors.push({ task: "watchdog", message: describeError(error) })
    }

    const cadence = await resolveSyncCadence()
    detail.cadence = cadence

    // Primeiro boot ou instalação nova: sem credencial da Pluggy não há o que
    // sincronizar. Isso é estado de setup, não falha — o log fica limpo e a UI
    // pede a configuração. Sem esta guarda, cada tick lançaria exceção.
    const { isPluggyConfigured } = await import("@/lib/integrations/pluggy")
    if (!(await isPluggyConfigured())) {
      detail.pluggy = "not-configured"
      // O dreno de webhooks ainda roda: eventos podem estar enfileirados de uma
      // configuração anterior, e o watchdog acima já rodou.
      await runTask("webhook-drain", TICK_INTERVAL_MS, async () => {
        detail.webhookDrain = await drainPendingWebhookEvents()
      })
      return { ran, skipped: false, errors, detail }
    }

    // Eventos de webhook que ficaram pendentes (processo morreu entre o 200 e o
    // processamento) ou falharam. Vem primeiro: é o caminho mais fresco.
    await runTask("webhook-drain", TICK_INTERVAL_MS, async () => {
      detail.webhookDrain = await drainPendingWebhookEvents()
    })

    const lastReconcile =
      state.lastRunAt["daily-reconcile"] ??
      (await lastSuccessfulRunAt("reconcile"))?.getTime()

    if (
      forced.has("daily-reconcile") ||
      !lastReconcile ||
      Date.now() - lastReconcile >= RECONCILE_INTERVAL_MS
    ) {
      await runTask("daily-reconcile", 0, async () => {
        detail.reconcile = await runDailyReconcile(cadence)
      })
    } else {
      // Reconciliação e incremental fazem o mesmo caminho — não rodam juntas.
      const lastIncremental =
        state.lastRunAt["incremental-sync"] ??
        (await lastSuccessfulRunAt("incremental"))?.getTime()

      if (
        forced.has("incremental-sync") ||
        !lastIncremental ||
        Date.now() - lastIncremental >= cadence.intervalMs
      ) {
        await runTask("incremental-sync", 0, async () => {
          detail.incremental = await runIncrementalSync(cadence)
        })
      }
    }

    await runTask("balances", BALANCE_REFRESH_MS, async () => {
      detail.balances = await runBalanceRefresh()
    })

    return { ran, skipped: false, errors, detail }
  } finally {
    state.running = false
  }

  async function runTask(
    task: TaskName,
    intervalMs: number,
    body: () => Promise<void>,
  ) {
    if (!forced.has(task) && intervalMs > 0 && !isDue(task, intervalMs)) return
    try {
      await body()
      ran.push(task)
    } catch (error) {
      errors.push({ task, message: describeError(error) })
      console.error(`[scheduler] tarefa ${task} falhou:`, error)
    } finally {
      markRan(task)
    }
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────

/**
 * Liga o agendador. Chamado por `instrumentation.ts`; protegido contra dupla
 * inicialização (HMR em dev, múltiplos imports) pelo estado em `globalThis`.
 */
export function startScheduler() {
  const state = getState()
  if (state.timer) return { started: false, reason: "already-running" as const }

  state.startedAt = Date.now()
  state.timer = setInterval(() => {
    void runSchedulerTick().catch((error) =>
      console.error("[scheduler] tick falhou:", error),
    )
  }, TICK_INTERVAL_MS)
  // Não segura o event loop no shutdown.
  state.timer.unref?.()

  console.log(
    `[scheduler] ativo — tick de ${TICK_INTERVAL_MS / 1000}s, watchdog e sync incremental configurável em /settings.`,
  )

  // Primeiro tick logo após o boot (dá tempo do `prisma db push` terminar).
  setTimeout(() => {
    void runSchedulerTick().catch((error) =>
      console.error("[scheduler] tick inicial falhou:", error),
    )
  }, 10_000).unref?.()

  // Garante o registro do webhook na Pluggy — sem isso nenhum evento chega.
  setTimeout(() => {
    void reconcilePluggyWebhook()
      .then((result) =>
        console.log(
          `[scheduler] webhook Pluggy: ${result.reason} (${result.url})`,
        ),
      )
      .catch((error) =>
        console.warn(
          `[scheduler] registro do webhook não aplicado: ${describeError(error)}`,
        ),
      )
  }, 15_000).unref?.()

  return { started: true }
}

export function stopScheduler() {
  const state = getState()
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
}

export function getSchedulerStatus() {
  const state = getState()
  return {
    active: Boolean(state.timer),
    startedAt: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    running: state.running,
    lastRunAt: Object.fromEntries(
      Object.entries(state.lastRunAt).map(([task, at]) => [
        task,
        new Date(at as number).toISOString(),
      ]),
    ),
  }
}
