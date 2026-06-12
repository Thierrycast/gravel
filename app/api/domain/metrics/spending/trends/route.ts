import { jsonError, jsonOk } from "@/lib/core/http"
import { getSpendingTrendsMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getSpendingTrendsMetrics(searchParams)
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}
