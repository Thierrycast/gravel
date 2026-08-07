import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import {
  getSchedulerStatus,
  isTaskName,
  runSchedulerTick,
  runWatchdog,
} from "@/lib/ingestion/scheduler"

export const dynamic = "force-dynamic"

/** Estado do agendador in-process: ativo, o que rodou e quando. */
export async function GET(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    return jsonOk({ results: getSchedulerStatus() })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Gatilho externo de um ciclo do agendador (cron/systemd do host, se algum dia
 * for preferível ao timer in-process). Aguarda o ciclo terminar para o chamador
 * ver o resultado — o timer interno é fire-and-forget.
 *
 * `force: ["incremental-sync"]` ignora a cadência configurada.
 */
export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: string[]
      watchdogOnly?: boolean
    }

    if (body.watchdogOnly) {
      return jsonOk({ results: { watchdog: await runWatchdog() } })
    }

    const force = Array.isArray(body.force)
      ? body.force.filter(isTaskName)
      : undefined

    return jsonOk({ results: await runSchedulerTick({ force }) })
  } catch (error) {
    return jsonError(error)
  }
}
