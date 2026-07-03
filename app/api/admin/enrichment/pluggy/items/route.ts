import { jsonError, jsonOk } from "@/lib/core/http"
import { runItemEnrichment } from "@/lib/domain/enrichment/pluggy-item"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/admin/enrichment/pluggy/items
 * Roda recurring-payments + behavior-analysis por item (todos ou um `itemId`).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}) as Record<string, unknown>)
    const itemId = typeof body?.itemId === "string" ? body.itemId : undefined
    const results = await runItemEnrichment(itemId)
    return jsonOk({ results })
  } catch (error) {
    return jsonError(error)
  }
}
