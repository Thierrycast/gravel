import { jsonError, jsonOk } from "@/lib/core/http"
import { getNetWorthMetrics } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const results = await getNetWorthMetrics()
    return jsonOk({
      summary: {
        points: results.points.length,
      },
      results,
    })
  } catch (error) {
    return jsonError(error)
  }
}
