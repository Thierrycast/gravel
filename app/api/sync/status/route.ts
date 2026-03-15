import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [pluggyRuns, binanceRuns, pluggyItems, domainCounts] =
      await Promise.all([
        prisma.opsSyncRun.findMany({
          where: { provider: "PLUGGY" },
          orderBy: { startedAt: "desc" },
          take: 5,
        }),
        prisma.opsSyncRun.findMany({
          where: { provider: "BINANCE" },
          orderBy: { startedAt: "desc" },
          take: 5,
        }),
        prisma.pluggyItem.findMany(),
        Promise.all([
          prisma.domainAccount.count(),
          prisma.domainTransaction.count(),
          prisma.domainBill.count(),
          prisma.domainInvestment.count(),
          prisma.domainCryptoAsset.count(),
          prisma.domainRecurringRule.count({ where: { active: true } }),
        ]),
      ])

    const [accounts, transactions, bills, investments, crypto, recurring] =
      domainCounts

    const allRuns = [...pluggyRuns, ...binanceRuns].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )

    const lastPluggyRun = pluggyRuns[0] ?? null
    const lastBinanceRun = binanceRuns[0] ?? null

    return jsonOk({
      results: {
        providers: {
          pluggy: {
            lastRun: lastPluggyRun,
            recentRuns: pluggyRuns,
            connectedItems: pluggyItems.length,
            items: pluggyItems,
          },
          binance: {
            lastRun: lastBinanceRun,
            recentRuns: binanceRuns,
          },
        },
        domainCounts: {
          accounts,
          transactions,
          bills,
          investments,
          crypto,
          recurring,
        },
        recentRuns: allRuns.slice(0, 10),
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
