import { Prisma } from "@prisma/client"

import { resolveSyncCadence, runSchedulerTick } from "./scheduler"

function isSchemaNotReadyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

/**
 * Ponto de entrada externo para um ciclo de sincronização (rota `/api/sync/cron`
 * e CLI). O agendador in-process já faz isso por conta própria; isto existe para
 * gatilho manual ou por cron do host.
 *
 * A versão anterior desta função consultava um `OpsSyncRun` em `RUNNING` e
 * desistia se encontrasse um — um run órfão de 18/07/2026 deixou o auto-sync
 * parado por 19 dias. Agora a serialização é do próprio tick (que também roda o
 * watchdog e libera órfãos), não de uma consulta que pode ver estado morto.
 */
export async function checkAndTriggerAutoSync(options?: { force?: boolean }) {
  try {
    const cadence = await resolveSyncCadence()
    const result = await runSchedulerTick(
      options?.force ? { force: ["incremental-sync"] } : undefined,
    )

    return {
      triggered: result.ran.length > 0,
      skipped: result.skipped,
      ran: result.ran,
      errors: result.errors,
      cadence,
      detail: result.detail,
    }
  } catch (error) {
    if (isSchemaNotReadyError(error)) {
      return { triggered: false, status: "schema_not_ready" as const }
    }

    console.error("[auto-sync] ciclo falhou:", error)
    return { triggered: false, error }
  }
}
