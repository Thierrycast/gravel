"use client"

import { 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  TrendingUp, 
} from "lucide-react"

import dynamic from "next/dynamic"
import { StatTile } from "@/components/dashboard/stat-tile"
import { ChartSkeleton } from "@/components/dashboard/skeleton-chart"
import { RecentTransactions } from "@/components/dashboard/recent-transactions"
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses"
import { usePeriod } from "@/hooks/use-period"
import { useCurrency } from "@/lib/currency-context"
import { PeriodSwitcher } from "@/components/period-switcher"

const NetWorthChart = dynamic(
  () => import("@/components/dashboard/net-worth-chart").then(mod => mod.NetWorthChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

type OverviewDashboardData = {
  overview: {
    fiat: {
      netWorth: number
      assets: number
      investments: number
    }
    inflow: number
    outflow: number
    counts: {
      investments: number
    }
  }
  categories: {
    results: Array<{
      categoryId: string | null
      name: string
      amount: number
      sharePercent: number
    }>
  }
  netWorth: {
    points: Array<{
      date: string
      netWorth: number
      assets?: number | null
      liabilities?: number | null
    }>
  }
  transactions: {
    results: Array<{
      id: string
      description: string
      amount: number
      date: string
      direction?: string
      category: string
      categoryId?: string | null
      accountName: string
      merchantName?: string | null
    }>
  }
  recurring: {
    rules: Array<{
      id: string
      description: string
      amount: number
      frequency: string
      category: string
      nextDate: string
    }>
    summary: {
      totalMonthly: number
    }
  }
}

interface OverviewDashboardProps {
  initialData: OverviewDashboardData
}

export function OverviewDashboard({ initialData }: OverviewDashboardProps) {
  const periodState = usePeriod()
  const { format } = useCurrency()

  const { overview, categories, netWorth, transactions, recurring } = initialData

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header & Period Switcher */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {periodState.label} • {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PeriodSwitcher state={periodState} />
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Patrimônio Líquido"
          value={format(overview.fiat.netWorth)}
          icon={Wallet}
          hint={`Total em ativos: ${format(overview.fiat.assets)}`}
          tone="neutral"
        />
        <StatTile
          label="Entradas"
          value={format(overview.inflow)}
          icon={ArrowUpRight}
          tone="positive"
        />
        <StatTile
          label="Saídas"
          value={format(overview.outflow)}
          icon={ArrowDownLeft}
          tone="negative"
        />
        <StatTile
          label="Investimentos"
          value={format(overview.fiat.investments)}
          icon={TrendingUp}
          hint={`${overview.counts.investments} ativos tradicionais`}
          tone="info"
        />
      </div>

      {/* Charts & Secondary Analysis */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface flex flex-col gap-6 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="size-4" /> Evolução do Patrimônio
            </h2>
          </div>
          <div className="h-[300px] w-full">
            <NetWorthChart history={netWorth.points} period={periodState.period === "all" ? "ALL" : "1Y"} />
          </div>
        </div>

        <div className="surface flex flex-col gap-6 p-6">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="size-4" /> Gastos por Categoria
          </h2>
          <div className="flex flex-col gap-4">
            {categories.results.map((cat) => (
              <div key={cat.categoryId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{cat.name}</span>
                  <span className="tabular-nums font-semibold">{format(cat.amount)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div 
                    className="h-full rounded-full bg-primary/80" 
                    style={{ width: `${cat.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transactions & Bills */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentTransactions transactions={transactions.results} loading={false} />
        </div>
        <div>
          <UpcomingExpenses rules={recurring.rules} totalMonthly={recurring.summary.totalMonthly} loading={false} />
        </div>
      </div>
    </div>
  )
}
