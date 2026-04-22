import { Prisma } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { getCryptoPortfolioMetrics } from "@/lib/domain/analytics"
import { getUsdBrlRate } from "@/lib/exchange-rate"

export const dynamic = "force-dynamic"

function toBrl(value: Prisma.Decimal, rate: Prisma.Decimal): Prisma.Decimal {
  return value.mul(rate)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const [summary, usdBrl] = await Promise.all([
      getCryptoPortfolioMetrics(searchParams),
      getUsdBrlRate(),
    ])

    const rate = new Prisma.Decimal(usdBrl)

    const totalValue = toBrl(summary.totalValue, rate)
    const totalCostBasis = toBrl(summary.totalCostBasis, rate)
    const totalUnrealizedPnl = toBrl(summary.totalUnrealizedPnl, rate)
    const totalRealizedPnl = toBrl(summary.totalRealizedPnl, rate)
    const totalPnl = totalUnrealizedPnl.plus(totalRealizedPnl)
    const totalPnlPercent = totalCostBasis.equals(0)
      ? 0
      : totalPnl.div(totalCostBasis).mul(100).toNumber()

    const mappedSummary = {
      totalValue,
      totalInvested: totalCostBasis,
      totalPnl,
      pnlPercentage: totalPnlPercent,
      assetCount: summary.assets,
      allocations: summary.allocations.map((a) => ({
        asset: a.asset,
        value: a.value ? toBrl(new Prisma.Decimal(a.value.toString()), rate) : a.value,
        percentage: a.sharePercent,
      })),
      bestPerformer: summary.bestPerformer?.asset ?? null,
      worstPerformer: summary.worstPerformer?.asset ?? null,
      exchangeRate: usdBrl,
    }

    return jsonOk({
      summary: mappedSummary,
      results: mappedSummary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
