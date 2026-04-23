import { jsonOk, jsonError } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"
import { runPluggySync } from "@/lib/ingestion/provider-sync"

export const dynamic = "force-dynamic"

/**
 * GET /api/sync/trigger
 * Returns the last sync run info (timestamp, status) — used for polling UI state.
 */
export async function GET() {
  try {
    const lastRun = await prisma.opsSyncRun.findFirst({
      where: { provider: "PLUGGY" },
      orderBy: { startedAt: "desc" },
    })
    return jsonOk({
      results: {
        lastSyncAt: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
        syncStatus: lastRun?.status ?? null,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * POST /api/sync/trigger
 * Triggers a full Pluggy sync from the UI (no API key required — this is a personal finance app).
 * Returns immediately after starting so the frontend can poll via GET.
 */
export async function POST() {
  try {
    // Fire-and-forget: start the sync without blocking the response
    runPluggySync({
      scope: "ui/manual-trigger",
      resource: "full",
    }).catch((err) => {
      console.error("[sync/trigger] sync failed:", err)
    })

    return jsonOk({ results: { triggered: true, startedAt: new Date().toISOString() } })
  } catch (error) {
    return jsonError(error)
  }
}
