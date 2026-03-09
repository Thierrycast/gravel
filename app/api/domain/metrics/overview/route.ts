import { jsonError, jsonOk } from "@/lib/core/http"
import { getOverviewMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const summary = await getOverviewMetrics(searchParams)
    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
