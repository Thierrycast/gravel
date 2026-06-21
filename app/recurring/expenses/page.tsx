"use client"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { useApi } from "@/hooks/use-api"
import { daysUntilLabel } from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PageError } from "@/components/page-error"

interface RecurringExpenseRule {
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
  isInstallment?: boolean
  currentInstallment?: number
  totalInstallments?: number
}

interface RecurringExpenseSummary {
  totalMonthlyExpenses: number
  fixedMonthlyExpenses: number
  installmentMonthlyExpenses: number
  referenceMonth: string
  count: number
}

interface RecurringExpenseData {
  rules: RecurringExpenseRule[]
  summary: RecurringExpenseSummary
  monthlyTotals: Array<{
    month: number
    fixed: number
    installments: number
    total: number
  }>
}

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
}

const chartConfig: ChartConfig = {
  expenses: {
    label: "Despesas",
    color: "#f43f5e",
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

export default function RecurringExpensesPage() {
  const { format, formatCompact } = useCurrency()
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const { data, loading, error, refetch } = useApi<RecurringExpenseData>("/api/recurring/expenses", {
    year: String(currentYear),
    month: String(currentMonth + 1),
  })
  
  if (error) {
    return <PageError message="Erro ao carregar despesas recorrentes" refetch={refetch} />
  }
  const rules = data?.rules ?? []
  const monthlyTotal = data?.summary.totalMonthlyExpenses ?? 0

  const chartData = (() => {
    if (!data) return []
    return MONTHS.map((month, index) => ({
      month,
      expenses: data.monthlyTotals[index]?.total ?? 0,
      fixed: data.monthlyTotals[index]?.fixed ?? 0,
      installments: data.monthlyTotals[index]?.installments ?? 0,
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
        Despesas Recorrentes
      </h1>

      {/* Chart */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Este ano / {currentYear}
          </p>
          <div className="flex items-center gap-2">
            <div className="size-2.5 rounded-full bg-rose-500" />
            <span className="text-xs text-muted-foreground">Fixas + parcelas devidas</span>
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
                        <span>Despesas: {format(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          {/* Month summary */}
          <div className="w-44 rounded-lg border bg-popover p-4 shrink-0 hidden lg:block">
            <div className="text-sm font-semibold mb-2">{MONTH_FULL[currentMonth]}</div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Fixas</span>
              <span>{format(data?.summary.fixedMonthlyExpenses ?? 0)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Parcelas</span>
              <span>{format(data?.summary.installmentMonthlyExpenses ?? 0)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold tabular-nums text-pink-400">
                {format(monthlyTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expense list */}
      <div>
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Despesas recorrentes e parcelas ativas
          </h3>
        </div>

        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhuma despesa recorrente encontrada.
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-8 rounded-full bg-pink-500/10 flex items-center justify-center text-lg shrink-0">
                    {rule.description.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{rule.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs">
                        {rule.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {rule.isInstallment
                          ? `Parcela ${rule.currentInstallment ?? 0}/${rule.totalInstallments ?? "?"}`
                          : (frequencyLabel[rule.frequency] ?? rule.frequency)}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="text-right ml-3">
                  <p className="text-sm font-bold tabular-nums text-pink-400">
                    {format(Math.abs(rule.amount))}
                  </p>
                  {rule.nextDate && (
                    <p className="text-xs text-muted-foreground">
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
