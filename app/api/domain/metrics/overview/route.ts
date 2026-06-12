import { Prisma } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { getOverviewMetrics } from "@/lib/domain/analytics"
import { getUsdBrlRate } from "@/lib/exchange-rate"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const [summaryRaw, usdBrl] = await Promise.all([
      getOverviewMetrics(searchParams),
      getUsdBrlRate(),
    ])

    // crypto is stored in USD — convert to BRL and propagate so all aggregates stay consistent
    const rate = new Prisma.Decimal(usdBrl)
    const cryptoTotalBrl = summaryRaw.cryptoTotal.mul(rate)
    const cryptoNetWorthBrl = cryptoTotalBrl

    const summary = {
      ...summaryRaw,
      cryptoTotal: cryptoTotalBrl,
      cryptoNetWorth: cryptoNetWorthBrl,
      grossAssets: summaryRaw.fiatAssets.plus(cryptoTotalBrl),
      netWorth: summaryRaw.fiatNetWorth.plus(cryptoNetWorthBrl),
      usdBrlRate: rate,
    }

    const prevParams = new URLSearchParams(searchParams)
    const now = new Date()
    const period = searchParams.get("period") ?? "mtd"

    let prevFrom: Date
    let prevTo: Date

    switch (period) {
      case "7d":
        prevTo = new Date(now.getTime() - 7 * 86400000)
        prevFrom = new Date(prevTo.getTime() - 7 * 86400000)
        break
      case "30d":
        prevTo = new Date(now.getTime() - 30 * 86400000)
        prevFrom = new Date(prevTo.getTime() - 30 * 86400000)
        break
      case "90d":
        prevTo = new Date(now.getTime() - 90 * 86400000)
        prevFrom = new Date(prevTo.getTime() - 90 * 86400000)
        break
      case "180d":
        prevTo = new Date(now.getTime() - 180 * 86400000)
        prevFrom = new Date(prevTo.getTime() - 180 * 86400000)
        break
      case "12m":
      case "365d":
        prevTo = new Date(now.getTime() - 365 * 86400000)
        prevFrom = new Date(prevTo.getTime() - 365 * 86400000)
        break
      case "ytd": {
        prevFrom = new Date(now.getFullYear() - 1, 0, 1)
        prevTo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        break
      }
      case "mtd":
      default:
        prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        prevTo = new Date(now.getFullYear(), now.getMonth(), 0)
        break
    }

    prevParams.set("from", prevFrom.toISOString().split("T")[0])
    prevParams.set("to", prevTo.toISOString().split("T")[0])
    prevParams.delete("period")

    let incomeChange: number | null = null
    let expenseChange: number | null = null
    let netChange: number | null = null

    try {
      const prev = await getOverviewMetrics(prevParams)
      const prevInflow = prev.monthlyInflow.toNumber()
      const prevOutflow = prev.monthlyOutflow.toNumber()
      const prevNet = prev.monthlyNet.toNumber()
      const curInflow = summary.monthlyInflow.toNumber()
      const curOutflow = summary.monthlyOutflow.toNumber()
      const curNet = summary.monthlyNet.toNumber()

      if (prevInflow > 0) incomeChange = ((curInflow - prevInflow) / prevInflow) * 100
      if (prevOutflow > 0) expenseChange = ((curOutflow - prevOutflow) / prevOutflow) * 100
      if (prevNet !== 0) netChange = ((curNet - prevNet) / Math.abs(prevNet)) * 100
    } catch {
      // previous-period comparison is opportunistic
    }

    return jsonOk({
      summary: {
        ...summary,
        incomeChange,
        expenseChange,
        netChange,
      },
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
