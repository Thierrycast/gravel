import { jsonError, jsonOk } from "@/lib/core/http"
import { getSpendingByMerchantMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getSpendingByMerchantMetrics(searchParams)

    const mapped = payload.results.map((item) => ({
      merchant: item.name,
      merchantId: item.merchantId,
      total: item.amount,
      percentage: item.sharePercent,
      transactionCount: item.count,
      cnpj: item.cnpj,
    }))

    return jsonOk({
      summary: {
        total: payload.total,
        appliedFilters: payload.appliedFilters,
      },
      results: mapped,
    })
  } catch (error) {
    return jsonError(error)
  }
}
