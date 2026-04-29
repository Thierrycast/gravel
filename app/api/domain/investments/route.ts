import { jsonError, jsonOk } from "@/lib/core/http"
import { getDomainInvestments } from "@/lib/domain/queries"
import { normalizeCurrencyCode } from "@/lib/domain/currency"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getDomainInvestments(searchParams)
    const byCurrency = payload.results.reduce<Record<string, { count: number; balance: number }>>(
      (summary, investment) => {
        const currencyCode = normalizeCurrencyCode(investment.currencyCode)
        const entry = summary[currencyCode] ?? { count: 0, balance: 0 }
        entry.count += 1
        entry.balance += Number(investment.balance?.toString() ?? "0")
        summary[currencyCode] = entry
        return summary
      },
      {}
    )

    return jsonOk({
      summary: {
        total: payload.total,
        byCurrency,
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
