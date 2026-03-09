import { jsonError, jsonOk } from "@/lib/core/http"
import { getCryptoAssetMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getCryptoAssetMetrics(searchParams)

    return jsonOk({
      summary: payload.summary,
      results: payload.results,
      meta: {
        total: payload.total,
        page: payload.page,
        pageSize: payload.pageSize,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
