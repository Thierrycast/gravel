"use client"

import { 
  BarChart3, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  TrendingUp,
  Lightbulb,
  AlertTriangle
} from "lucide-react"

import dynamic from "next/dynamic"
import { StatTile } from "@/components/dashboard/stat-tile"
import { ChartSkeleton } from "@/components/dashboard/skeleton-chart"
import { RecentTransactions } from "@/components/dashboard/recent-transactions"
import { PeriodSwitcher } from "@/components/period-switcher"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { useApi } from "@/hooks/use-api"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useCurrency } from "@/lib/currency-context"
import { usePeriod } from "@/hooks/use-period"
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses"

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
      scenarioNetWorth?: number
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

type Nudge = {
  type: "WARNING" | "INFO" | string
  title: string
  message: string
}

type InsightsResponse = {
  nudges?: Nudge[]
}

export function OverviewDashboard({ initialData }: OverviewDashboardProps) {
  const periodState = usePeriod()
  const { format } = useCurrency()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: insights } = useApi<InsightsResponse>("/api/insights")
  
  const [showSalary, setShowSalary] = useState(searchParams.get("showFutureSalary") !== "false")
  const [showFuture, setShowFuture] = useState(searchParams.get("showFutureAccounts") !== "false")

  const updateParam = (key: string, value: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, String(value))
    router.push(`?${params.toString()}`, { scroll: false })
  }

  const { overview, categories, netWorth, transactions, recurring } = initialData
  const nudges = insights?.nudges ?? []

  return (
    <div className="flex flex-col gap-8 pb-12">
      
      {/* AI Nudges */}
      {nudges.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nudges.map((nudge, i) => (
            <Alert key={i} className="bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-4 duration-500">
               {nudge.type === "WARNING" ? <AlertTriangle className="size-4 text-red-500" /> : <Lightbulb className="size-4 text-amber-500" />}
               <AlertTitle className="text-xs font-bold uppercase tracking-wider">{nudge.title}</AlertTitle>
               <AlertDescription className="text-xs text-muted-foreground">
                 {nudge.message}
               </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Header & Period Switcher */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {periodState.label} • {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4 border-r pr-6 border-border/60">
             <div className="flex items-center space-x-2">
                <Switch 
                  id="show-salary" 
                  checked={showSalary} 
                  onCheckedChange={(val) => {
                    setShowSalary(val)
                    updateParam("showFutureSalary", val)
                  }}
                />
                <Label htmlFor="show-salary" className="text-xs font-medium cursor-pointer">Salários</Label>
             </div>
             <div className="flex items-center space-x-2">
                <Switch 
                  id="show-future" 
                  checked={showFuture} 
                  onCheckedChange={(val) => {
                    setShowFuture(val)
                    updateParam("showFutureAccounts", val)
                  }}
                />
                <Label htmlFor="show-future" className="text-xs font-medium cursor-pointer">Parcelas</Label>
             </div>
          </div>
          <PeriodSwitcher state={periodState} />
        </div>
      </div>

      {/* Main Stats Grid */}
      <p className="sr-only">Resultado do período</p>
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
              <TrendingUp className="size-4" /> Patrimônio ao longo do tempo
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
      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-2 flex flex-col h-full">
          <RecentTransactions transactions={transactions.results} loading={false} />
        </div>
        <div className="flex flex-col h-full">
          <UpcomingExpenses rules={recurring.rules} totalMonthly={recurring.summary.totalMonthly} loading={false} />
        </div>
      </div>
    </div>
  )
}
