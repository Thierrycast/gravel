"use client"

import { useState, useMemo } from "react"
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface ProjectionMonth {
  month: number
  year: number
  label: string
  income: number
  recurringExpenses: number
  installments: number
  variableExpenses: number
  projected: number
  balance: number
}

interface ProjectionSummary {
  averageMonthlyIncome: number
  averageMonthlyExpenses: number
  projectedSavings: number
}

interface ProjectionData {
  months: ProjectionMonth[]
  summary: ProjectionSummary
}

const horizons = [
  { label: "3M", value: "3" },
  { label: "6M", value: "6" },
  { label: "12M", value: "12" },
]

const chartConfig: ChartConfig = {
  income: {
    label: "Receitas",
    color: "#10b981",
  },
  recurringExpenses: {
    label: "Recorr\u00eancias",
    color: "#f43f5e",
  },
  installments: {
    label: "Parcelas",
    color: "#f59e0b",
  },
  variableExpenses: {
    label: "Vari\u00e1vel",
    color: "#6b7280",
  },
  balance: {
    label: "Saldo Projetado",
    color: "#3b82f6",
  },
}

export default function ProjectionPage() {
  const [months, setMonths] = useState("6")
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  const { data, loading } = useApi<ProjectionData>("/api/projection", {
    months,
  })

  const insights = useMemo(() => {
    const monthsData = data?.months ?? []
    const summary = data?.summary
    if (monthsData.length === 0) return []
    const result: { title: string; variant: "default" | "destructive" | "secondary" }[] = []

    const installmentMonths = monthsData.filter((m) => m.installments > 0)
    if (installmentMonths.length > 0 && installmentMonths.length < monthsData.length) {
      result.push({
        title: `Parcelamentos terminam em ${installmentMonths.length} meses`,
        variant: "secondary",
      })
    }

    const overBudget = monthsData.filter(
      (m) =>
        m.recurringExpenses + m.installments + m.variableExpenses > m.income
    )
    if (overBudget.length > 0) {
      const pct = Math.round(
        ((overBudget[0].recurringExpenses +
          overBudget[0].installments +
          overBudget[0].variableExpenses -
          overBudget[0].income) /
          overBudget[0].income) *
          100
      )
      result.push({
        title: `Despesas excedem receita por ${pct}% em ${overBudget.length} mês(es)`,
        variant: "destructive",
      })
    }

    if ((summary?.projectedSavings ?? 0) > 0) {
      result.push({
        title: `Economia projetada de ${formatCurrency(summary?.projectedSavings ?? 0)} no período`,
        variant: "default",
      })
    }

    return result.slice(0, 3)
  }, [data])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Proje&ccedil;&atilde;o de Saldo
        </h1>
        <div className="flex gap-0.5">
          {horizons.map((h) => (
            <button
              key={h.value}
              onClick={() => setMonths(h.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                months === h.value
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Insight Cards */}
      {insights.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center gap-3 pt-4">
                <Lightbulb className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Badge variant={insight.variant} className="text-xs">
                    Insight
                  </Badge>
                  <span className="text-sm">{insight.title}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Receita M&eacute;dia Mensal
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-400">
            {formatCurrency(data?.summary.averageMonthlyIncome ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Despesa M&eacute;dia Mensal
          </p>
          <p className="text-2xl font-bold tabular-nums text-pink-400">
            {formatCurrency(data?.summary.averageMonthlyExpenses ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Economia Projetada
          </p>
          <p className="text-2xl font-bold tabular-nums text-blue-400">
            {formatCurrency(data?.summary.projectedSavings ?? 0)}
          </p>
        </div>
      </div>

      {/* Main Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projeção Mensal</CardTitle>
          <CardDescription>
            Receitas, despesas e saldo projetado por mês
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <ComposedChart data={data?.months ?? []} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
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
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="income"
                fill="var(--color-income)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="recurringExpenses"
                fill="var(--color-recurringExpenses)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="installments"
                fill="var(--color-installments)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="variableExpenses"
                fill="var(--color-variableExpenses)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                dataKey="balance"
                type="monotone"
                stroke="var(--color-balance)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento Mensal</CardTitle>
          <CardDescription>
            Clique em um mês para expandir os detalhes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {(data?.months ?? []).map((m, idx) => {
              const isExpanded = expandedMonth === m.label
              const prevBalance =
                idx > 0 ? (data?.months?.[idx - 1]?.balance ?? 0) : 0
              const totalExpenses =
                m.recurringExpenses + m.installments + m.variableExpenses
              const result = m.income - totalExpenses

              return (
                <div key={m.label} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      setExpandedMonth(isExpanded ? null : m.label)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{m.label}</span>
                      <Badge
                        variant={result >= 0 ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {result >= 0 ? "Positivo" : "Negativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-sm font-semibold ${
                          m.balance >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {formatCurrency(m.balance)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t px-3 pb-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Componente</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Saldo Inicial</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(prevBalance)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Receitas</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {formatCurrency(m.income)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Recorrências</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {formatCurrency(-m.recurringExpenses)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Parcelas</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {formatCurrency(-m.installments)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Variável</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {formatCurrency(-m.variableExpenses)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold">
                              Resultado
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                result >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {formatCurrency(result)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
