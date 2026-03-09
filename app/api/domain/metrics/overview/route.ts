import { jsonError, jsonOk } from "@/lib/core/http"
import { getOverviewMetrics } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const summary = await getOverviewMetrics()
    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
