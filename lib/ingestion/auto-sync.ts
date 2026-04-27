import { prisma } from "@/lib/prisma"
import { SourceProvider, OpsRunStatus } from "@prisma/client"
import { runFullOperationalSync } from "./provider-sync"

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

    // If never synced or last sync was more than intervalHours ago
    const intervalMs = intervalHours * 60 * 60 * 1000
    const needsSync = !lastSyncAt || (now.getTime() - lastSyncAt.getTime()) > intervalMs

    if (needsSync) {
      console.log(`[auto-sync] Triggering automatic sync. Last sync: ${lastSyncAt?.toISOString() ?? "never"}. Interval: ${intervalHours}h`)
      
      // Fire-and-forget background sync
      runFullOperationalSync({
        scope: "auto-sync/daily",
      }).catch((err) => {
        // Only log if it's not a lock error (which we already tried to avoid but race conditions exist)
        if (!(err instanceof Error && err.message.includes("Lock ativo"))) {
          console.error("[auto-sync] background sync failed:", err)
        }
      })
      
      return { triggered: true, lastSyncAt }
    }

    return { triggered: false, lastSyncAt }
  } catch (error) {
    console.error("[auto-sync] check failed:", error)
    return { triggered: false, error }
  }
}
