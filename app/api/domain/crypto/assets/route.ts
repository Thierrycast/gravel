import { jsonError, jsonOk } from "@/lib/core/http"
import { getDomainCryptoAssets } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getDomainCryptoAssets(searchParams)

    return jsonOk({
      summary: {
        total: payload.total,
      },
      results: payload.results,
      meta: {
        page: payload.page,
        pageSize: payload.pageSize,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
