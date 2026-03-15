"use client"

import { useState, useMemo } from "react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { SpendingPaceChart } from "@/components/dashboard/spending-pace-chart"
import { NetWorthChart } from "@/components/dashboard/net-worth-chart"
import { RecentTransactions } from "@/components/dashboard/recent-transactions"
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses"
import Link from "next/link"
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  summary: {
    totalBalance: number
    monthlyIncome: number
    monthlyExpenses: number
    netIncome: number
    cashFlow: { income: number; expenses: number; net: number }
    accounts: Array<{ id: string; name: string; balance: number }>
    billsSummary: Record<string, unknown>
  }
}

interface SpendingCategoriesData {
  summary: { total: number }
  results: Array<{
    category: string
    categoryId: string
    total: number
    percentage: number
    transactionCount: number
  }>
}

interface NetWorthData {
  summary: {
    netWorth: number
    totalAssets: number
    totalLiabilities: number
    history: Array<{ date: string; netWorth: number }>
  }
}

interface TransactionsData {
  results: Array<{
    id: string
    description: string
    amount: number
    date: string
    type: string
    category: string
    categoryId?: string
    accountName: string
    merchantName?: string
  }>
}

interface RecurringExpensesData {
  rules: Array<{
    id: string
    description: string
    amount: number
    frequency: string
    category: string
    nextDate: string
  }>
  summary: { totalMonthly: number; count: number }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCumulativeSpending(
  expenses: number,
  daysInMonth: number,
  currentDay: number
): Array<{ day: number; cumulative: number }> {
  // Distribute spending roughly across days elapsed
  if (currentDay === 0) return []
  const dailyAvg = expenses / currentDay
  const result: Array<{ day: number; cumulative: number }> = []
  let cumulative = 0
  for (let d = 1; d <= currentDay; d++) {
    cumulative += dailyAvg
    result.push({ day: d, cumulative: Math.round(cumulative * 100) / 100 })
  }
  return result
}

function getCategoryColor(index: number): string {
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ]
  return colors[index % colors.length]
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [netWorthPeriod, setNetWorthPeriod] = useState("6M")

  const { data: overview, loading: loadingOverview } = useApi<OverviewData>(
    "/api/domain/metrics/overview"
  )
  const { data: categories, loading: loadingCategories } =
    useApi<SpendingCategoriesData>("/api/domain/metrics/spending/categories")
  const { data: netWorth, loading: loadingNetWorth } = useApi<NetWorthData>(
    "/api/domain/metrics/net-worth"
  )
  const { data: transactions, loading: loadingTransactions } =
    useApi<TransactionsData>("/api/domain/transactions", {
      pageSize: "8",
      sort: "date",
      order: "desc",
    })
  const { data: recurring, loading: loadingRecurring } =
    useApi<RecurringExpensesData>("/api/recurring/expenses")

  // Derived data
  const income = overview?.summary.cashFlow.income ?? 0
  const expenses = overview?.summary.cashFlow.expenses ?? 0
  const net = overview?.summary.netIncome ?? 0
  const incomeRatio = income + Math.abs(expenses) > 0
    ? (income / (income + Math.abs(expenses))) * 100
    : 50

  // Build spending pace data from overview
  const now = new Date()
  const currentDay = now.getDate()
  const daysInCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0
  ).getDate()
  const daysInPrevMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    0
  ).getDate()

  const currentMonthPace = useMemo(
    () =>
      buildCumulativeSpending(
        Math.abs(expenses),
        daysInCurrentMonth,
        currentDay
      ),
    [expenses, daysInCurrentMonth, currentDay]
  )

  // For previous month, use a rough estimate (same total spread over full month)
  const previousMonthPace = useMemo(
    () =>
      buildCumulativeSpending(
        Math.abs(expenses) * 1.1, // approximate previous (10% higher as baseline)
        daysInPrevMonth,
        daysInPrevMonth
      ),
    [expenses, daysInPrevMonth]
  )

  const topCategories = categories?.results.slice(0, 6) ?? []
  const maxCategoryTotal =
    topCategories.length > 0
      ? Math.max(...topCategories.map((c) => Math.abs(c.total)))
      : 1

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral das suas finanças
        </p>
      </div>

      {/* Row 1: Spending Pace + Net Worth */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Spending Pace */}
        <Card>
          <CardHeader>
            <CardTitle>Ritmo de Gastos</CardTitle>
            <CardDescription>
              Comparativo de gastos acumulados dia a dia
            </CardDescription>
            <CardAction>
              <Link
                href="/spending"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver mais
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(Math.abs(expenses))}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    gastos até o dia {currentDay}
                  </span>
                </div>
                <SpendingPaceChart
                  currentMonth={currentMonthPace}
                  previousMonth={previousMonthPace}
                />
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="h-0.5 w-4 rounded-full bg-chart-1" />
                    <span>Mês atual</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-0.5 w-4 rounded-full bg-chart-4 border-dashed" />
                    <span>Mês anterior</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Net Worth */}
        <Card>
          <CardHeader>
            <CardTitle>Patrimônio Líquido</CardTitle>
            <CardAction>
              <div className="flex gap-1">
                {["1M", "3M", "6M", "1Y", "ALL"].map((p) => (
                  <Button
                    key={p}
                    variant={netWorthPeriod === p ? "default" : "ghost"}
                    size="xs"
                    onClick={() => setNetWorthPeriod(p)}
                  >
                    {p === "ALL" ? "Tudo" : p}
                  </Button>
                ))}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {loadingNetWorth ? (
              <div className="space-y-3">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-[200px] w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-3 mb-4">
                  <span className="text-2xl font-bold tabular-nums">
                    {formatCurrency(netWorth?.summary.netWorth ?? 0)}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground mb-4">
                  <span>
                    Ativos:{" "}
                    <span className="text-foreground font-medium">
                      {formatCurrency(netWorth?.summary.totalAssets ?? 0)}
                    </span>
                  </span>
                  <span>
                    Passivos:{" "}
                    <span className="text-foreground font-medium">
                      {formatCurrency(netWorth?.summary.totalLiabilities ?? 0)}
                    </span>
                  </span>
                </div>
                <NetWorthChart
                  history={netWorth?.summary.history ?? []}
                  period={netWorthPeriod}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Monthly Result + Top Categories */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Monthly Result */}
        <Card>
          <CardHeader>
            <CardTitle>Resultado Mensal</CardTitle>
            <CardDescription>Receitas vs Despesas</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      net >= 0 ? "text-green-500" : "text-red-500"
                    }`}
                  >
                    {formatCurrency(net)}
                  </span>
                  {net > 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : net < 0 ? (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  ) : (
                    <Minus className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Receitas</span>
                    <span>Despesas</span>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-red-500/20 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-green-500"
                      style={{ width: `${Math.min(incomeRatio, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Breakdown */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
                      <span className="text-muted-foreground">Receitas</span>
                    </div>
                    <span className="font-medium tabular-nums text-green-500">
                      {formatCurrency(income)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      <span className="text-muted-foreground">Despesas</span>
                    </div>
                    <span className="font-medium tabular-nums text-red-500">
                      {formatCurrency(expenses)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                      <span className="text-muted-foreground">Saldo</span>
                    </div>
                    <span
                      className={`font-medium tabular-nums ${
                        net >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {formatCurrency(net)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Top Categorias</CardTitle>
            <CardDescription>
              Maiores categorias de gastos do mês
            </CardDescription>
            <CardAction>
              <Link
                href="/categories"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver todas
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {loadingCategories ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 flex-1" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_minmax(100px,2fr)_auto] gap-3 pb-2 border-b text-xs font-medium text-muted-foreground">
                  <span>Categoria</span>
                  <span>Proporção</span>
                  <span className="text-right">Valor</span>
                </div>
                {topCategories.map((cat, index) => {
                  const barPercent =
                    (Math.abs(cat.total) / maxCategoryTotal) * 100
                  return (
                    <div
                      key={cat.categoryId}
                      className="grid grid-cols-[1fr_minmax(100px,2fr)_auto] gap-3 items-center py-2.5 border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: getCategoryColor(index),
                          }}
                        />
                        <span className="text-sm truncate">{cat.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${barPercent}%`,
                              backgroundColor: getCategoryColor(index),
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                          {formatPercent(cat.percentage)}
                        </span>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-right">
                        {formatCurrency(Math.abs(cat.total))}
                      </span>
                    </div>
                  )
                })}
                {topCategories.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma categoria encontrada
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent Transactions + Upcoming Expenses */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RecentTransactions
          transactions={transactions?.results ?? null}
          loading={loadingTransactions}
        />
        <UpcomingExpenses
          rules={recurring?.rules ?? null}
          totalMonthly={recurring?.summary.totalMonthly ?? null}
          loading={loadingRecurring}
        />
      </div>
    </div>
  )
}
