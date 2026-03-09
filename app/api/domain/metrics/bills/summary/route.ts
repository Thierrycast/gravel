import { jsonError, jsonOk } from "@/lib/core/http"
import { getBillsSummaryMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const summary = await getBillsSummaryMetrics(searchParams)

    return jsonOk({
      summary,
      results: summary.upcoming,
      meta: {
        counts: summary.counts,
        appliedFilters: summary.appliedFilters,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
