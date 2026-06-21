import { jsonOk, jsonError } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"
import { runFullOperationalSync } from "@/lib/ingestion/provider-sync"
import { SourceProvider } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * GET /api/sync/trigger
 * Returns the last sync run info (timestamp, status) — used for polling UI state.
 */
export async function GET() {
  try {
    
    let lastRun = await prisma.opsSyncRun.findFirst({
      where: { 
        provider: SourceProvider.MANUAL,
        resource: "sync-full"
      },
      orderBy: { startedAt: "desc" },
    })

    if (!lastRun) {
      lastRun = await prisma.opsSyncRun.findFirst({
        where: { provider: SourceProvider.PLUGGY },
        orderBy: { startedAt: "desc" },
      })
    }

    return jsonOk({
      results: {
        lastSyncAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
        syncStatus: lastRun?.status ?? null,
        provider: lastRun?.provider ?? null,
        resource: lastRun?.resource ?? null,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * POST /api/sync/trigger
 * Triggers a full operational sync (Pluggy + Binance + Projections).
 * Returns immediately after starting so the frontend can poll via GET.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const isFull = body.full !== false // default to true
    const force = body.force === true

    if (force) {
      await prisma.opsSyncLock.deleteMany()
      console.log("[sync/trigger] Todos os locks de sincronização foram forçados a serem liberados.")
    }

    if (isFull) {
      // Fire-and-forget: start the full sync without blocking the response
      runFullOperationalSync({
        
      }).catch((err) => {
        console.error("[sync/trigger] full sync failed:", err)
      })
    } else {
      const { runPluggySync } = await import("@/lib/ingestion/provider-sync")
      runPluggySync({
        scope: "ui/manual-trigger",
        resource: "full",
      }).catch((err) => {
        console.error("[sync/trigger] pluggy sync failed:", err)
      })
    }

    return jsonOk({ results: { triggered: true, startedAt: new Date().toISOString() } })
  } catch (error) {
    return jsonError(error)
  }
}