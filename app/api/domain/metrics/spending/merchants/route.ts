import { jsonError, jsonOk } from "@/lib/core/http"
import { getSpendingByMerchantMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getSpendingByMerchantMetrics(searchParams)

    return jsonOk({
      summary: {
        total: payload.total,
        appliedFilters: payload.appliedFilters,
      },
      results: payload.results,
    })
  } catch (error) {
    return jsonError(error)
  }
}
