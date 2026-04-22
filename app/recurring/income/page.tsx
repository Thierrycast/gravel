"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { useApi } from "@/hooks/use-api"
import { formatDate, daysUntilLabel } from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
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
    label: "Receitas Recorrentes",
    color: "#10b981",
  },
}

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Mar\u00e7o", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export default function RecurringIncomePage() {
  const { format, formatCompact } = useCurrency()
  const currentMonth = new Date().getMonth()
  const { data, loading } = useApi<RecurringIncomeData>("/api/recurring/income")
  const rules = data?.rules ?? []
  const monthlyTotal = rules.reduce((sum, r) => sum + Number(r.amount), 0)

  const chartData = (() => {
    if (rules.length === 0) return []
    return MONTHS.map((month) => ({
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Receitas Recorrentes
      </h1>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Este ano / {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Receitas Recorrentes</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          <div className="flex-1 min-w-0">
            <ChartContainer config={chartConfig} className="h-56 w-full">
              <BarChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} strokeOpacity={0.1} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => formatCompact(v)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span>Receita: {format(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Month summary */}
          <div className="w-44 rounded-lg border bg-popover p-4 shrink-0 hidden lg:block">
            <div className="text-sm font-semibold mb-2">{MONTH_FULL[currentMonth]}</div>
            <div className="border-t pt-2 flex justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold tabular-nums text-emerald-400">
                {format(monthlyTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Income list */}
      <div>
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Receitas Recorrentes
          </h3>
        </div>

        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma receita recorrente encontrada.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-lg shrink-0">
                    {rule.description.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{rule.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">
                        {frequencyLabel[rule.frequency] ?? rule.frequency}
                      </Badge>
                      {rule.nextDate && (
                        <span className="text-[10px] text-muted-foreground">
                          Pr&oacute;xima: {formatDate(rule.nextDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right ml-3">
                  <p className="text-sm font-bold tabular-nums text-emerald-400">
                    {format(rule.amount)}
                  </p>
                  {rule.nextDate && (
                    <p className="text-[10px] text-muted-foreground">
                      {daysUntilLabel(rule.nextDate)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
