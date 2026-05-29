import { SourceProvider } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [
      pluggyItems,
      pluggyRuns,
      binanceRuns,
      recentRuns,
      accounts,
      transactions,
      bills,
      investments,
      crypto,
      recurring,
    ] = await Promise.all([
      prisma.pluggyItem.findMany({
        orderBy: { updatedAt: "desc" },
      }),
      prisma.opsSyncRun.findMany({
        where: { provider: SourceProvider.PLUGGY },
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
      prisma.opsSyncRun.findMany({
        where: { provider: SourceProvider.BINANCE },
        orderBy: { startedAt: "desc" },
        take: 10,
      }),
      prisma.opsSyncRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      prisma.domainAccount.count(),
      prisma.domainTransaction.count(),
      prisma.domainBill.count(),
      prisma.domainInvestment.count(),
      prisma.domainCryptoAsset.count(),
      prisma.domainRecurringRule.count({ where: { active: true } }),
    ])

    return jsonOk({
      results: {
        providers: {
          pluggy: {
            lastRun: pluggyRuns[0] ?? null,
            recentRuns: pluggyRuns,
            connectedItems: pluggyItems.length,
            items: pluggyItems,
            lastItemUpdatedAt: pluggyItems[0]?.updatedAt ?? null,
          },
          binance: {
            lastRun: binanceRuns[0] ?? null,
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
        recentRuns,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
