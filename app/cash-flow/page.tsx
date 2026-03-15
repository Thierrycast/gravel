"use client"

import { useState, useMemo } from "react"
import {
  TrendingUp,
  TrendingDown,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
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

interface CashFlowItem {
  date: string
  income: number
  expense: number
  net: number
}

interface CashFlowResponse {
  results: CashFlowItem[]
}

interface OverviewResponse {
  totalBalance: number
  monthlyIncome: number
  monthlyExpenses: number
  netIncome: number
  incomeChange: number
  expenseChange: number
  netChange: number
}

const PERIOD_OPTIONS = [
  { label: "Últimos 3 meses", months: "3" },
  { label: "Últimos 6 meses", months: "6" },
  { label: "Este ano", months: "12" },
  { label: "Últimos 12 meses", months: "12" },
] satisfies Array<{ label: string; months: string }>

const netChartConfig: ChartConfig = {
  net: {
    label: "Resultado Líquido",
    color: "hsl(var(--chart-1))",
  },
}

const expenseChartConfig: ChartConfig = {
  expense: {
    label: "Despesas",
    color: "hsl(var(--chart-4))",
  },
}

const incomeChartConfig: ChartConfig = {
  income: {
    label: "Receitas",
    color: "hsl(var(--chart-2))",
  },
  trend: {
    label: "Tendência",
    color: "hsl(var(--chart-1))",
  },
}

function formatMonth(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00")
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
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

export default function CashFlowPage() {
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[1])

  const { data: cashFlow, loading: cashFlowLoading } =
    useApi<CashFlowResponse>("/api/domain/metrics/cash-flow", {
      group: "month",
      months: selectedPeriod.months,
    })

  const { data: overview, loading: overviewLoading } =
    useApi<OverviewResponse>("/api/domain/metrics/overview")

  const loading = cashFlowLoading || overviewLoading

  const chartData = useMemo(() => {
    if (!cashFlow?.results) return []
    return cashFlow.results.map((item) => ({
      ...item,
      label: formatMonth(item.date),
    }))
  }, [cashFlow])

  const totals = useMemo(() => {
    if (!cashFlow?.results)
      return { totalIncome: 0, totalExpense: 0, totalNet: 0 }
    return cashFlow.results.reduce(
      (acc, item) => ({
        totalIncome: acc.totalIncome + item.income,
        totalExpense: acc.totalExpense + item.expense,
        totalNet: acc.totalNet + item.net,
      }),
      { totalIncome: 0, totalExpense: 0, totalNet: 0 }
    )
  }, [cashFlow])

  if (loading) return <LoadingSkeleton />

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Fluxo de Caixa
          </h1>
          <p className="text-muted-foreground">
            Acompanhe suas receitas, despesas e resultado ao longo do tempo.
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

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Net Result Card */}
        <Card>
          <CardHeader>
            <CardDescription>Resultado Líquido</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <span
                className={
                  totals.totalNet >= 0 ? "text-emerald-600" : "text-red-500"
                }
              >
                {formatCurrency(totals.totalNet)}
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
          <CardContent>
            <ChartContainer config={netChartConfig} className="h-[200px] w-full">
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                    }).format(value)
                  }
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={({ cx, cy, payload }) => {
                    const isNegative = payload.net < 0
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={4}
                        fill={
                          isNegative
                            ? "hsl(var(--chart-4))"
                            : "hsl(var(--chart-1))"
                        }
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                      />
                    )
                  }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card>
          <CardHeader>
            <CardDescription>Gastos</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <span className="text-red-500">
                {formatCurrency(totals.totalExpense)}
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
          <CardContent>
            <ChartContainer
              config={expenseChartConfig}
              className="h-[200px] w-full"
            >
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                    }).format(value)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  }
                />
                <Bar
                  dataKey="expense"
                  fill="hsl(var(--chart-4))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Income Card */}
        <Card>
          <CardHeader>
            <CardDescription>Receitas</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <span className="text-emerald-600">
                {formatCurrency(totals.totalIncome)}
              </span>
              {overview?.incomeChange !== undefined && (
                <span
                  className={`flex items-center text-xs font-medium ${
                    overview.incomeChange >= 0
                      ? "text-emerald-600"
                      : "text-red-500"
                  }`}
                >
                  {overview.incomeChange >= 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {formatPercent(Math.abs(overview.incomeChange))}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={incomeChartConfig}
              className="h-[200px] w-full"
            >
              <BarChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      compactDisplay: "short",
                    }).format(value)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(value as number)}
                    />
                  }
                />
                <Bar
                  dataKey="income"
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
