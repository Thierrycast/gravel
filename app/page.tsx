import { 
  getOverviewMetrics, 
  getSpendingByCategoryMetrics, 
  getNetWorthMetrics, 
  getBillsSummaryMetrics 
} from "@/lib/domain/analytics"
import { getDashboardTransactions } from "@/lib/domain/queries"
import { getDashboardRecurring } from "@/lib/domain/derived"
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

  // Parallel fetch everything directly from the domain layer (bypassing internal API)
  const [overview, categories, netWorth, transactions, recurring, bills] = await Promise.all([
    getOverviewMetrics(urlParams),
    getSpendingByCategoryMetrics(urlParams),
    getNetWorthMetrics(urlParams),
    getDashboardTransactions(urlParams),
    getDashboardRecurring(),
    getBillsSummaryMetrics(urlParams),
  ])

  // Apply serialization to ensure clean payload for Client Components
  const initialData = serializeDomain({
    overview,
    categories,
    netWorth,
    transactions,
    recurring,
    bills,
  })

  return (
    <div className="container mx-auto py-6">
      <OverviewDashboard initialData={initialData} />
    </div>
  )
}
