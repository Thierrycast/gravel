"use client"

import { useState, useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Repeat, CreditCard } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface RecurringRule {
  id: string
  description: string
  amount: number
  frequency: string
  category: string
  nextDate: string
  type: string
  occurrences: number
  lastDate: string
  confidence: number
  isManual: boolean
}

interface RecurringSummary {
  totalMonthlyExpenses: number
  totalMonthlyIncome: number
  count: number
}

interface RecurringData {
  rules: RecurringRule[]
  summary: RecurringSummary
}

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
}

const chartConfig: ChartConfig = {
  fixed: {
    label: "Fixas",
    color: "var(--chart-1)",
  },
  installments: {
    label: "Parcelas",
    color: "var(--chart-2)",
  },
}

export default function RecurringPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data, loading } = useApi<RecurringData>("/api/recurring", {
    year: String(year),
  })

  const fixedExpenses = useMemo(
    () => data?.rules.filter((r) => r.type === "FIXED" && r.amount < 0) ?? [],
    [data]
  )

  const installmentItems = useMemo(
    () => data?.rules.filter((r) => r.type === "INSTALLMENT") ?? [],
    [data]
  )

  const chartData = useMemo(() => {
    if (!data) return []
    const months = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ]
    const fixedMonthly = fixedExpenses.reduce(
      (sum, r) => sum + Math.abs(r.amount),
      0
    )
    const installmentMonthly = installmentItems.reduce(
      (sum, r) => sum + Math.abs(r.amount),
      0
    )
    return months.map((month) => ({
      month,
      fixed: fixedMonthly,
      installments: installmentMonthly,
    }))
  }, [data, fixedExpenses, installmentItems])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recorrências</h1>
          <p className="text-muted-foreground">
            Visão geral das despesas fixas e parcelas
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <Button
              key={y}
              variant={y === year ? "default" : "outline"}
              size="sm"
              onClick={() => setYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total Mensal</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                (data?.summary.totalMonthlyExpenses ?? 0) +
                  (data?.summary.totalMonthlyIncome ?? 0)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Despesas Recorrentes</CardDescription>
            <CardTitle className="text-2xl text-red-500">
              {formatCurrency(data?.summary.totalMonthlyExpenses ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Itens Recorrentes</CardDescription>
            <CardTitle className="text-2xl">
              {data?.summary.count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Totais Mensais de Recorrências</CardTitle>
          <CardDescription>
            Comparativo entre contas fixas e parcelas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-72 w-full">
            <BarChart data={chartData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>
                        {chartConfig[name as keyof typeof chartConfig]?.label}:{" "}
                        {formatCurrency(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="fixed"
                fill="var(--color-fixed)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="installments"
                fill="var(--color-installments)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Two columns: Fixed & Installments */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Fixed expenses */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Repeat className="size-4 text-muted-foreground" />
              <CardTitle>Contas Fixas</CardTitle>
            </div>
            <CardDescription>
              {fixedExpenses.length} despesas fixas recorrentes
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fixedExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta fixa encontrada.
              </p>
            )}
            {fixedExpenses.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {rule.description}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {rule.category}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {frequencyLabel[rule.frequency] ?? rule.frequency}
                    </Badge>
                  </div>
                </div>
                <span className="text-sm font-semibold text-red-500">
                  {formatCurrency(rule.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Installments */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <CardTitle>Parcelas</CardTitle>
            </div>
            <CardDescription>
              {installmentItems.length} parcelamentos em andamento
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {installmentItems.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma parcela encontrada.
              </p>
            )}
            {installmentItems.map((rule) => {
              const total = rule.occurrences > 0 ? rule.occurrences : 12
              const remaining = rule.nextDate && rule.lastDate
                ? Math.max(
                    1,
                    Math.ceil(
                      (new Date(rule.lastDate).getTime() -
                        new Date(rule.nextDate).getTime()) /
                        (1000 * 60 * 60 * 24 * 30)
                    )
                  )
                : total
              const current = Math.max(0, total - remaining)
              const progressValue = (current / total) * 100

              return (
                <div
                  key={rule.id}
                  className="flex flex-col gap-2 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {rule.description}
                    </span>
                    <span className="text-sm font-semibold text-red-500">
                      {formatCurrency(rule.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={progressValue} className="flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {current}/{total}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
