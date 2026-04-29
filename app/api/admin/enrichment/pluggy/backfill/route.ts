import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runPluggyTransactionEnrichment } from "@/lib/domain/enrichment/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | { limit?: number; batches?: number }
      | null
    const batches = Math.min(Math.max(body?.batches ?? 5, 1), 50)
    const summaries = []

    for (let index = 0; index < batches; index += 1) {
      const summary = await runPluggyTransactionEnrichment({ limit: body?.limit ?? 500 })
      summaries.push(summary)
      if (summary.scanned === 0 || summary.enriched === 0) break
    }

    const summary = summaries.reduce(
      (total, current) => ({
        scanned: total.scanned + current.scanned,
        enriched: total.enriched + current.enriched,
        failed: total.failed + current.failed,
      }),
      { scanned: 0, enriched: 0, failed: 0 }
    )

    return jsonOk({ summary, results: summaries })
  } catch (error) {
    return jsonError(error)
  }
}
