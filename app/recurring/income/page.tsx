"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingUp } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatDate, daysUntilLabel } from "@/lib/format"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface RecurringIncomeRule {
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

interface RecurringIncomeSummary {
  totalMonthlyIncome: number
  count: number
}

interface RecurringIncomeData {
  rules: RecurringIncomeRule[]
  summary: RecurringIncomeSummary
}

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
}

const chartConfig: ChartConfig = {
  income: {
    label: "Receita",
    color: "var(--chart-3)",
  },
}

export default function RecurringIncomePage() {
  const { data, loading } = useApi<RecurringIncomeData>("/api/recurring/income")

  const chartData = (() => {
    if (!data) return []
    const months = [
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
      "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ]
    const monthlyTotal = data.rules.reduce((sum, r) => sum + r.amount, 0)
    return months.map((month) => ({
      month,
      income: monthlyTotal,
    }))
  })()

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Receitas Recorrentes
        </h1>
        <p className="text-muted-foreground">
          Entradas fixas e receitas previstas mensalmente
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Receita Mensal Recorrente</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">
              {formatCurrency(data?.summary.totalMonthlyIncome ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fontes de Receita</CardDescription>
            <CardTitle className="text-2xl">
              {data?.summary.count ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600" />
            <CardTitle>Receitas Mensais</CardTitle>
          </div>
          <CardDescription>
            Total de receitas recorrentes por mês
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
                    formatter={(value) => (
                      <span>Receita: {formatCurrency(Number(value))}</span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="income"
                fill="var(--color-income)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Income list */}
      <Card>
        <CardHeader>
          <CardTitle>Itens de Receita</CardTitle>
          <CardDescription>
            Todas as receitas recorrentes identificadas
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(!data?.rules || data.rules.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Nenhuma receita recorrente encontrada.
            </p>
          )}
          {data?.rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{rule.description}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {frequencyLabel[rule.frequency] ?? rule.frequency}
                  </Badge>
                  {rule.nextDate && (
                    <span className="text-xs text-muted-foreground">
                      Próxima: {formatDate(rule.nextDate)} ({daysUntilLabel(rule.nextDate)})
                    </span>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold text-emerald-600">
                {formatCurrency(rule.amount)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
