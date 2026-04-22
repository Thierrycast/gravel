"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ExternalLink,
} from "lucide-react"
import { PieChart, Pie, Cell } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"
import { getCategoryEmoji } from "@/lib/category-emoji"
import { SankeyChart } from "@/components/charts/sankey-chart"

interface OverviewResponse {
  summary: {
    monthlyInflow: number
    monthlyOutflow: number
    monthlyNet: number
    incomeChange: number | null
    expenseChange: number | null
    netChange: number | null
  }
}

interface SpendingCategory {
  name: string
  categoryId: string
  amount: number
  sharePercent: number
  count: number
}

interface SpendingResponse {
  summary: {
    total: number
  }
  results: SpendingCategory[]
}

const PERIOD_OPTIONS = [
  { label: "Este mês", value: "this_month" },
  { label: "Últimos 3 meses", value: "3m" },
  { label: "Últimos 6 meses", value: "6m" },
  { label: "Este ano", value: "ytd" },
] satisfies Array<{ label: string; value: string }>

const CATEGORY_COLORS = [
  "#f43f5e", // rose-500
  "#ec4899", // pink-500
  "#a855f7", // purple-500
  "#6366f1", // indigo-500
  "#3b82f6", // blue-500
  "#06b6d4", // cyan-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
]

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[400px] lg:col-span-3" />
        <Skeleton className="h-[400px] lg:col-span-2" />
      </div>
      <Skeleton className="h-[400px] w-full" />
    </div>
  )
}

export default function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[0])

  const { data: overview, loading: overviewLoading } =
    useApi<OverviewResponse>("/api/domain/metrics/overview")

  const { data: spending, loading: spendingLoading } =
    useApi<SpendingResponse>("/api/domain/metrics/spending/categories")

  const loading = overviewLoading || spendingLoading

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return []
    return [...spending.results].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [spending])

  const categoryChartConfig = useMemo(() => {
    const config: ChartConfig = {}
    sortedCategories.forEach((cat, i) => {
      config[cat.name] = {
        label: cat.name,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }
    })
    return config
  }, [sortedCategories])

  const pieData = useMemo(() => {
    return sortedCategories.map((cat, i) => ({
      name: cat.name,
      value: Math.abs(cat.amount),
      fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))
  }, [sortedCategories])

  const monthlyIncome = overview?.summary?.monthlyInflow ?? 0
  const monthlyExpenses = Math.abs(overview?.summary?.monthlyOutflow ?? 0)
  const netResult = overview?.summary?.monthlyNet ?? 0
  const expenseChange = overview?.summary?.expenseChange ?? null
  const netChange = overview?.summary?.netChange ?? null
  const totalSpending = spending?.summary?.total ?? 0

  if (loading) return <LoadingSkeleton />

  // Income/expense ratio bar
  const total = monthlyIncome + monthlyExpenses
  const incomePercent = total > 0 ? (monthlyIncome / total) * 100 : 50

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {selectedPeriod.label}
              <ChevronDown className="ml-1 size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERIOD_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setSelectedPeriod(option)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hero: Total Gasto */}
      <div className="rounded-xl border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
          Total Gasto
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums tracking-tight">
            {formatCurrency(monthlyExpenses)}
          </span>
          {expenseChange != null && (
            <span
              className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                expenseChange <= 0 ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {expenseChange <= 0 ? (
                <ArrowDownRight className="size-4" />
              ) : (
                <ArrowUpRight className="size-4" />
              )}
              {formatPercent(Math.abs(expenseChange))}
              <span className="text-muted-foreground font-normal ml-1">vs período anterior</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Categories + Resultado */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Gastos por Categoria */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Gastos por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <ChartContainer
                config={categoryChartConfig}
                className="aspect-square h-[220px] shrink-0"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(value as number)}
                      />
                    }
                  />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="flex w-full flex-col gap-3">
                {sortedCategories.slice(0, 6).map((cat, i) => (
                  <div key={cat.categoryId ?? cat.name} className="flex items-center gap-3">
                    <div
                      className="size-3 shrink-0 rounded-full"
                      style={{
                        backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                      }}
                    />
                    <span className="flex-1 truncate text-sm">
                      {getCategoryEmoji(cat.name)} {cat.name}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(Math.abs(cat.amount))}
                    </span>
                  </div>
                ))}
                {sortedCategories.length > 6 && (
                  <p className="text-xs text-muted-foreground pl-6">
                    +{sortedCategories.length - 6} outras categorias
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultado Parcial */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Resultado Parcial
              </CardTitle>
              <Link
                href="/cash-flow"
                className="text-xs text-blue-500 hover:text-blue-400 inline-flex items-center gap-1"
              >
                fluxo de caixa
                <ExternalLink className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Net result */}
            <div>
              <span
                className={`text-3xl font-bold tabular-nums ${
                  netResult >= 0 ? "text-emerald-500" : "text-red-500"
                }`}
              >
                {formatCurrency(netResult)}
              </span>
              {netChange != null && (
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                      netChange >= 0 ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {netChange >= 0 ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {netChange >= 0 ? "+" : ""}
                    {formatPercent(Math.abs(netChange))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    vs mês anterior
                  </span>
                </div>
              )}
            </div>

            {/* Income/Expense bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${incomePercent}%` }}
              />
              <div
                className="bg-purple-500/60 transition-all"
                style={{ width: `${100 - incomePercent}%` }}
              />
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Receita</p>
                <p className="text-sm font-bold tabular-nums">
                  {formatCurrency(monthlyIncome)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Gasto</p>
                <p className="text-sm font-bold tabular-nums">
                  {formatCurrency(monthlyExpenses)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Excluído</p>
                <p className="text-sm font-bold tabular-nums text-muted-foreground">
                  {formatCurrency(0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sankey: Fluxo de Caixa */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Fluxo de Caixa
            </CardTitle>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(totalSpending)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <SankeyChart
            data={{
              income: monthlyIncome,
              categories: sortedCategories.map((cat, i) => ({
                name: cat.name,
                total: Math.abs(cat.amount),
                color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
              })),
            }}
            width={1100}
            height={Math.max(350, sortedCategories.length * 38)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
