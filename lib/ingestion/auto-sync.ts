import { prisma } from "@/lib/prisma"
import { Prisma, SourceProvider, OpsRunStatus } from "@prisma/client"
import { runFullOperationalSync } from "./provider-sync"

function isSchemaNotReadyError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  )
}

/**
 * Checks if a full synchronization is needed based on the last successful run.
 * Rules:
 * 1. Must have at least one successful sync per day (or based on UserSetting).
 * 2. Should not stay more than 24 hours without a sync.
 */
export async function checkAndTriggerAutoSync() {
  try {
    // Check if there's already a sync running to avoid lock contention noise
    const activeRun = await prisma.opsSyncRun.findFirst({
      where: {
        provider: SourceProvider.MANUAL,
        resource: "sync-full",
        status: OpsRunStatus.RUNNING,
      },
    })

    if (activeRun) {
      return { triggered: false, status: "already_running" }
    }

    // Get user settings for sync interval
    const settings = await prisma.userSetting.findFirst()
    const intervalHours = settings?.syncIntervalHours ?? 24
    
    // Check for the last successful full operational sync
    const lastSuccessfulRun = await prisma.opsSyncRun.findFirst({
      where: {
        provider: SourceProvider.MANUAL,
        resource: "sync-full",
        status: OpsRunStatus.SUCCESS,
      },
      orderBy: { finishedAt: "desc" },
    })

    const now = new Date()
    const lastSyncAt = lastSuccessfulRun?.finishedAt

    const intervalMs = intervalHours * 60 * 60 * 1000
    const needsSync = !lastSyncAt || (now.getTime() - lastSyncAt.getTime()) > intervalMs

    if (needsSync) {
      // Fire-and-forget background sync
      runFullOperationalSync().catch((err) => {
        // Only log if it's not a lock error (which we already tried to avoid but race conditions exist)
        if (!(err instanceof Error && err.message.includes("Lock ativo"))) {
          console.error("[auto-sync] background sync failed:", err)
        }
      })
      
      return { triggered: true, lastSyncAt }
    }

    return { triggered: false, lastSyncAt }
  } catch (error) {
    if (isSchemaNotReadyError(error)) {
      return { triggered: false, status: "schema_not_ready" as const }
    }

    console.error("[auto-sync] check failed:", error)
    return { triggered: false, error }
  }
}
