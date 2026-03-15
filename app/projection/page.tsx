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
    color: "var(--chart-3)",
  },
  recurringExpenses: {
    label: "Recorrências",
    color: "var(--chart-5)",
  },
  installments: {
    label: "Parcelas",
    color: "var(--chart-2)",
  },
  variableExpenses: {
    label: "Variável",
    color: "var(--chart-4)",
  },
  balance: {
    label: "Saldo Projetado",
    color: "var(--chart-1)",
  },
}

export default function ProjectionPage() {
  const [months, setMonths] = useState("6")
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  const { data, loading } = useApi<ProjectionData>("/api/projection", {
    months,
  })

  const insights = useMemo(() => {
    if (!data) return []
    const result: { title: string; variant: "default" | "destructive" | "secondary" }[] = []

    const installmentMonths = data.months.filter((m) => m.installments > 0)
    if (installmentMonths.length > 0 && installmentMonths.length < data.months.length) {
      result.push({
        title: `Parcelamentos terminam em ${installmentMonths.length} meses`,
        variant: "secondary",
      })
    }

    const overBudget = data.months.filter(
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

    if (data.summary.projectedSavings > 0) {
      result.push({
        title: `Economia projetada de ${formatCurrency(data.summary.projectedSavings)} no período`,
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Projeção de Saldo
          </h1>
          <p className="text-muted-foreground">
            Previsão de receitas, despesas e saldo futuro
          </p>
        </div>
        <div className="flex items-center gap-1">
          {horizons.map((h) => (
            <Button
              key={h.value}
              variant={months === h.value ? "default" : "outline"}
              size="sm"
              onClick={() => setMonths(h.value)}
            >
              {h.label}
            </Button>
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
        <Card>
          <CardHeader>
            <CardDescription>Receita Média Mensal</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">
              {formatCurrency(data?.summary.averageMonthlyIncome ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Despesa Média Mensal</CardDescription>
            <CardTitle className="text-2xl text-red-500">
              {formatCurrency(data?.summary.averageMonthlyExpenses ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Economia Projetada</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(data?.summary.projectedSavings ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
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
            {data?.months.map((m, idx) => {
              const isExpanded = expandedMonth === m.label
              const prevBalance =
                idx > 0 ? data.months[idx - 1].balance : 0
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
                            ? "text-emerald-600"
                            : "text-red-500"
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
                                  ? "text-emerald-600"
                                  : "text-red-500"
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
