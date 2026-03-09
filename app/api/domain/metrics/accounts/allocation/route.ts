import { jsonError, jsonOk } from "@/lib/core/http"
import { getAccountAllocationMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const summary = await getAccountAllocationMetrics(searchParams)

    return jsonOk({
      summary,
      results: summary.byAccount,
      meta: {
        counts: summary.counts,
        byKind: summary.byKind,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
