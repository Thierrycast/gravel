"use client"

import { useState, useMemo } from "react"
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
} from "lucide-react"
import { PieChart, Pie, Cell } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
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
import { SankeyChart } from "@/components/charts/sankey-chart"

interface OverviewResponse {
  totalBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  netIncome: number
  incomeChange: number
  expenseChange: number
  netChange: number
}

interface SpendingCategory {
  category: string
  categoryId: string
  total: number
  percentage: number
  transactionCount: number
}

interface SpendingResponse {
  summary: {
    total: number
  }
  results: SpendingCategory[]
}

const PERIOD_OPTIONS = [
  { label: "Últimos 3 meses", months: "3" },
  { label: "Últimos 6 meses", months: "6" },
  { label: "Este ano", months: "12" },
  { label: "Últimos 12 meses", months: "12" },
] satisfies Array<{ label: string; months: string }>

const HSL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]


function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[1])

  const { data: overview, loading: overviewLoading } =
    useApi<OverviewResponse>("/api/domain/metrics/overview")

  const { data: spending, loading: spendingLoading } =
    useApi<SpendingResponse>("/api/domain/metrics/spending/categories")

  const loading = overviewLoading || spendingLoading

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return []
    return [...spending.results].sort((a, b) => b.total - a.total)
  }, [spending])

  const categoryChartConfig = useMemo(() => {
    const config: ChartConfig = {}
    sortedCategories.forEach((cat, i) => {
      config[cat.category] = {
        label: cat.category,
        color: HSL_COLORS[i % HSL_COLORS.length],
      }
    })
    return config
  }, [sortedCategories])

  const pieData = useMemo(() => {
    return sortedCategories.map((cat, i) => ({
      name: cat.category,
      value: cat.total,
      fill: HSL_COLORS[i % HSL_COLORS.length],
    }))
  }, [sortedCategories])

  const netResult = overview
    ? overview.monthlyIncome - overview.monthlyExpenses
    : 0
  const incomeRatio =
    overview && overview.monthlyIncome > 0
      ? (overview.monthlyExpenses / overview.monthlyIncome) * 100
      : 0

  if (loading) return <LoadingSkeleton />

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground">
            Análises detalhadas e comparativos financeiros.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {selectedPeriod.label}
              <ChevronDown className="ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PERIOD_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.months + option.label}
                onClick={() => setSelectedPeriod(option)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid Layout */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Total Gasto Card */}
        <Card>
          <CardHeader>
            <CardDescription>Total Gasto</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <span className="text-red-500">
                {formatCurrency(overview?.monthlyExpenses ?? 0)}
              </span>
              {overview?.expenseChange !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium ${
                    overview.expenseChange <= 0
                      ? "text-emerald-600"
                      : "text-red-500"
                  }`}
                >
                  {overview.expenseChange <= 0 ? (
                    <TrendingDown className="size-3" />
                  ) : (
                    <TrendingUp className="size-3" />
                  )}
                  {formatPercent(Math.abs(overview.expenseChange))}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Receitas</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {formatCurrency(overview?.monthlyIncome ?? 0)}
                </p>
                {overview?.incomeChange !== undefined && (
                  <span
                    className={`flex items-center text-xs ${
                      overview.incomeChange >= 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {overview.incomeChange >= 0 ? (
                      <ArrowUpRight className="mr-0.5 size-3" />
                    ) : (
                      <ArrowDownRight className="mr-0.5 size-3" />
                    )}
                    {formatPercent(Math.abs(overview.incomeChange))} vs anterior
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Despesas</p>
                <p className="text-lg font-semibold text-red-500">
                  {formatCurrency(overview?.monthlyExpenses ?? 0)}
                </p>
                {overview?.expenseChange !== undefined && (
                  <span
                    className={`flex items-center text-xs ${
                      overview.expenseChange <= 0
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {overview.expenseChange <= 0 ? (
                      <ArrowDownRight className="mr-0.5 size-3" />
                    ) : (
                      <ArrowUpRight className="mr-0.5 size-3" />
                    )}
                    {formatPercent(Math.abs(overview.expenseChange))} vs
                    anterior
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gastos por Categoria */}
        <Card>
          <CardHeader>
            <CardDescription>Gastos por Categoria</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(spending?.summary?.total ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ChartContainer
                config={categoryChartConfig}
                className="aspect-square h-[160px] shrink-0"
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
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={HSL_COLORS[index % HSL_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="flex w-full flex-col gap-2">
                {sortedCategories.slice(0, 5).map((cat, i) => (
                  <div key={cat.categoryId} className="flex items-center gap-2">
                    <div
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: HSL_COLORS[i % HSL_COLORS.length],
                      }}
                    />
                    <span className="flex-1 truncate text-sm">
                      {cat.category}
                    </span>
                    <span className="text-sm font-medium">
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                ))}
                {sortedCategories.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    +{sortedCategories.length - 5} outras categorias
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultado Parcial */}
        <Card>
          <CardHeader>
            <CardDescription>Resultado Parcial</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <span
                className={
                  netResult >= 0 ? "text-emerald-600" : "text-red-500"
                }
              >
                {formatCurrency(netResult)}
              </span>
              {overview?.netChange !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium ${
                    overview.netChange >= 0
                      ? "text-emerald-600"
                      : "text-red-500"
                  }`}
                >
                  {overview.netChange >= 0 ? (
                    <ArrowUpRight className="size-3" />
                  ) : (
                    <ArrowDownRight className="size-3" />
                  )}
                  {formatPercent(Math.abs(overview.netChange))}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Receitas vs Despesas
                </span>
                <span className="font-medium">
                  {formatPercent(Math.min(incomeRatio, 100))} utilizado
                </span>
              </div>
              <Progress
                value={Math.min(incomeRatio, 100)}
                className="h-2"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">
                    Receitas
                  </span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(overview?.monthlyIncome ?? 0)}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-red-500" />
                  <span className="text-xs text-muted-foreground">
                    Despesas
                  </span>
                </div>
                <p className="text-sm font-semibold">
                  {formatCurrency(overview?.monthlyExpenses ?? 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fluxo de Caixa (Sankey) */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Fluxo de Caixa</CardDescription>
            <CardTitle className="text-base">
              Receitas &rarr; Despesas &rarr; Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SankeyChart
              data={{
                income: overview?.monthlyIncome ?? 0,
                categories: sortedCategories.map((cat, i) => ({
                  name: cat.category,
                  total: cat.total,
                  color: HSL_COLORS[i % HSL_COLORS.length],
                })),
              }}
              height={Math.max(380, sortedCategories.length * 40)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
