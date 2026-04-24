import { 
  getOverviewMetrics, 
  getSpendingByCategoryMetrics, 
  getNetWorthMetrics 
} from "@/lib/domain/analytics"
import { getDashboardTransactions } from "@/lib/domain/queries"
import { getDashboardRecurring } from "@/lib/domain/derived"
import { ensurePrismaReady } from "@/lib/prisma"
import { OverviewDashboard } from "./overview-dashboard"
import { serializeDomain } from "@/lib/core/serialization"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  // Convert params to URLSearchParams for domain functions
  const urlParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlParams.append(key, value)
    } else if (Array.isArray(value)) {
      value.forEach((v) => urlParams.append(key, v))
    }
  })

  await ensurePrismaReady()

  // Parallel fetch everything directly from the domain layer (bypassing internal API)
  const [overview, categories, netWorth, transactions, recurring] = await Promise.all([
    getOverviewMetrics(urlParams),
    getSpendingByCategoryMetrics(urlParams),
    getNetWorthMetrics(urlParams),
    getDashboardTransactions(urlParams),
    getDashboardRecurring(),
  ])

  const initialData = serializeDomain({
    overview: {
      fiat: {
        netWorth: overview.fiatNetWorth,
        assets: overview.fiatAssets,
        investments: overview.investmentsTotal,
      },
      inflow: overview.periodInflow,
      outflow: overview.periodOutflow,
      counts: {
        investments: overview.counts.investments,
      },
    },
    categories: {
      results: categories.results.slice(0, 5),
    },
    netWorth: {
      points: netWorth.points,
    },
    transactions: {
      results: transactions.results.map((transaction) => ({
        ...transaction,
        category: transaction.categoryName,
      })),
    },
    recurring: {
      rules: recurring.rules.map((rule) => ({
        id: rule.id,
        description: rule.description,
        amount: rule.amount ?? 0,
        frequency: rule.frequency,
        category: rule.category,
        nextDate: rule.nextDate,
      })),
      summary: {
        totalMonthly: recurring.summary.totalMonthly,
      },
    },
  })

  return (
    <div className="container mx-auto py-6">
      <OverviewDashboard initialData={initialData} />
    </div>
  )
}
