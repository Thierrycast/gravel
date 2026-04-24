import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runPluggyTransactionEnrichment } from "@/lib/domain/enrichment/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as { limit?: number } | null
    const summary = await runPluggyTransactionEnrichment({ limit: body?.limit })
    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
