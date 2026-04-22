import { jsonError, jsonOk } from "@/lib/core/http"
import { getNetWorthMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const data = await getNetWorthMetrics(searchParams)

    return jsonOk({
      summary: {
        current: data.current,
        points: data.points,
        valuation: data.valuation,
        appliedFilters: data.appliedFilters,
      },
      results: data.points,
    })
  } catch (error) {
    return jsonError(error)
  }
}
