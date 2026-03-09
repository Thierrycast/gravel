import { jsonError, jsonOk } from "@/lib/core/http"
import { getCashFlowMetrics } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const results = await getCashFlowMetrics(searchParams)
    return jsonOk({
      summary: {
        points: results.length,
      },
      results,
    })
  } catch (error) {
    return jsonError(error)
  }
}
