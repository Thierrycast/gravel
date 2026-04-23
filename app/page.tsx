"use client"

import { Suspense, useMemo } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bitcoin,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Landmark,
  PiggyBank,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { useApi } from "@/hooks/use-api"
import { usePeriod } from "@/hooks/use-period"
import { PageHeader } from "@/components/page-header"
import { PeriodSwitcher } from "@/components/period-switcher"
import { PageError } from "@/components/page-error"
import { Skeleton } from "@/components/ui/skeleton"
import { NetWorthChart } from "@/components/dashboard/net-worth-chart"
import {
  amountToneClass,
  daysUntilLabel,
  formatDate,
  formatSignedPercent,
} from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import { getCategoryColor, getCategoryEmoji } from "@/lib/category-emoji"
import { cn } from "@/lib/utils"

// ── API contracts ────────────────────────────────────────────────────────────

interface OverviewData {
  summary: {
    accountBalance: number
    investmentsTotal: number
    cryptoTotal: number
    openBills: number
    loanBalance: number
    liabilitiesTotal: number
    fiatAssets: number
    fiatNetWorth: number
    cryptoNetWorth: number
    grossAssets: number
    netWorth: number
    monthlyInflow: number
    monthlyOutflow: number
    monthlyNet: number
    incomeChange: number | null
    expenseChange: number | null
    netChange: number | null
    usdBrlRate?: number
  }
}

interface CategoriesData {
  summary: { total: number }
  results: Array<{
    name: string
    categoryId: string | null
    amount: number
    sharePercent: number
    count: number
  }>
}

interface NetWorthHistory {
  summary: {
    current: number
    points: Array<{
      date: string
      netWorth: number
      assets?: number | null
      fiatAssets?: number | null
      cryptoAssets?: number | null
      liabilities?: number | null
      source?: string
    }>
    valuation: {
      fiatAssets: number
      accountBalance: number
      investmentsTotal: number
      cryptoAssets: number
      grossAssets: number
      liabilities: number
      fiatNetWorth: number
      cryptoNetWorth: number
      netWorth: number
      usdBrlRate?: number
    }
  }
}

interface TransactionsData {
  results: Array<{
    id: string
    description: string
    amount: number
    date: string
    direction: "INFLOW" | "OUTFLOW"
    categoryName: string
    categoryId: string | null
    accountName: string
  }>
}

interface RecurringExpensesData {
  rules: Array<{
    id: string
    description: string
    amount: number
    nextDate: string
    category: string
    frequency: string
  }>
  summary: { totalMonthly: number; count: number }
}

interface BillsSummary {
  summary: {
    totalOpen: number
    totalOverdue: number
    counts: { total: number; open: number; overdue: number; paid: number }
    upcoming: Array<{
      id: string
      dueDate: string | null
      totalAmount: number
      status: string
    }>
  }
}

// ── Local helpers ────────────────────────────────────────────────────────────

function ChangeBadge({
  value,
  reverse = false,
}: {
  value: number | null
  reverse?: boolean
}) {
  if (value == null || !Number.isFinite(value)) return null
  const positive = reverse ? value < 0 : value > 0
  const negative = reverse ? value > 0 : value < 0
  const tone = positive
    ? "text-emerald-500 dark:text-emerald-400"
    : negative
      ? "text-rose-500 dark:text-rose-400"
      : "text-muted-foreground"
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", tone)}>
      <Icon className="size-3" />
      {formatSignedPercent(value)}
    </span>
  )
}

function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  href,
  loading,
  tone = "neutral",
  delta,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  href?: string
  loading?: boolean
  tone?: "neutral" | "positive" | "negative" | "info"
  delta?: React.ReactNode
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    negative: "text-rose-500 dark:text-rose-400",
    info: "text-sky-500 dark:text-sky-400",
  }[tone]

  const Wrapper: React.ElementType = href ? Link : "div"
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "surface flex flex-col gap-2 p-4 transition-colors",
        href && "hover:bg-accent/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="section-eyebrow">{label}</p>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <p className={cn("text-[22px] font-semibold tabular-nums tracking-tight", toneClass)}>
          {value}
        </p>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        {hint ? <span className="truncate">{hint}</span> : <span />}
        {delta}
      </div>
    </Wrapper>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-44 rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      }
    >
      <OverviewPageContent />
    </Suspense>
  )
}

function OverviewPageContent() {
  const { format, formatSigned } = useCurrency()
  const period = usePeriod("mtd")

  const overview = useApi<OverviewData>("/api/domain/metrics/overview", period.params)
  const categories = useApi<CategoriesData>(
    "/api/domain/metrics/spending/categories",
    period.params
  )
  const netWorth = useApi<NetWorthHistory>("/api/domain/metrics/net-worth")
  const transactions = useApi<TransactionsData>("/api/domain/transactions", {
    pageSize: "8",
    sort: "date",
    order: "desc",
    ...period.params,
  })
  const recurring = useApi<RecurringExpensesData>("/api/recurring/expenses")
  const bills = useApi<BillsSummary>("/api/domain/metrics/bills/summary")

  const summary = overview.data?.summary
  const income = summary?.monthlyInflow ?? 0
  const expenses = summary?.monthlyOutflow ?? 0
  const net = summary?.monthlyNet ?? 0
  const expenseChange = summary?.expenseChange ?? null
  const incomeChange = summary?.incomeChange ?? null
  const netChange = summary?.netChange ?? null

  const fiatNetWorth = summary?.fiatNetWorth ?? 0
  const cryptoNetWorth = summary?.cryptoNetWorth ?? 0
  const totalNetWorth = summary?.netWorth ?? fiatNetWorth + cryptoNetWorth
  const accountBalance = summary?.accountBalance ?? 0
  const investments = summary?.investmentsTotal ?? 0
  const liabilities = summary?.liabilitiesTotal ?? 0
  const openBills = summary?.openBills ?? 0

  const incomeRatio =
    income + expenses > 0 ? (income / (income + expenses)) * 100 : 50

  // Top spending categories (truncate to 6 for the dashboard)
  const topCategories = useMemo(() => {
    if (!categories.data) return []
    return categories.data.results.slice(0, 6).map((cat) => ({
      ...cat,
      absAmount: Math.abs(cat.amount),
    }))
  }, [categories.data])

  const maxCategory = topCategories.length
    ? Math.max(...topCategories.map((c) => c.absAmount))
    : 1
  const missingCategory = useMemo(() => {
    return categories.data?.results.find((cat) => !cat.categoryId) ?? null
  }, [categories.data])

  // Upcoming recurring bills, sorted by nearest date, capped to the next 5
  const upcomingBills = useMemo(() => {
    if (!recurring.data?.rules) return []
    return [...recurring.data.rules]
      .sort(
        (a, b) =>
          new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime()
      )
      .slice(0, 5)
  }, [recurring.data])

  // Find the soonest open due date for the alert + headline tile hints.
  const nextBillDueDate = useMemo(() => {
    const upcoming = bills.data?.summary?.upcoming ?? []
    const future = upcoming
      .filter((b) => b.status !== "PAID" && b.status !== "CLOSED" && b.dueDate)
      .map((b) => b.dueDate as string)
      .sort()
    return future[0] ?? null
  }, [bills.data])

  // Alerts — only show what is genuinely actionable. Order from most urgent.
  const alerts = useMemo(() => {
    const out: Array<{ tone: "negative" | "warning" | "info"; text: string; href?: string }> = []
    const overdueCount = bills.data?.summary?.counts?.overdue ?? 0
    if (overdueCount > 0) {
      out.push({
        tone: "negative",
        text: `${overdueCount} fatura(s) em atraso totalizando ${format(bills.data?.summary?.totalOverdue ?? 0)}.`,
        href: "/bills",
      })
    }
    if (accountBalance < 0) {
      out.push({
        tone: "negative",
        text: `Saldo em contas negativo em ${format(Math.abs(accountBalance))}. Priorize cobrir o saldo antes de novos gastos.`,
        href: "/accounts",
      })
    }
    if (missingCategory) {
      out.push({
        tone: "warning",
        text: `${missingCategory.count} transação(ões) sem categoria somam ${format(Math.abs(missingCategory.amount))} no período.`,
        href: "/categories",
      })
    }
    if (net < 0) {
      out.push({
        tone: "warning",
        text: `Você gastou ${format(Math.abs(net))} a mais do que recebeu no período. Reveja as categorias com maior crescimento.`,
        href: "/cash-flow",
      })
    }
    if (expenseChange != null && expenseChange > 25) {
      out.push({
        tone: "warning",
        text: `Despesas ${formatSignedPercent(expenseChange)} versus o mês anterior. Vale checar onde está o aumento.`,
        href: "/categories",
      })
    }
    if (nextBillDueDate) {
      out.push({
        tone: "info",
        text: `Próxima fatura vence ${daysUntilLabel(nextBillDueDate).toLowerCase()}.`,
        href: "/bills",
      })
    }
    return out.slice(0, 3)
  }, [
    bills.data,
    accountBalance,
    missingCategory,
    net,
    expenseChange,
    nextBillDueDate,
    format,
  ])

  const hasError =
    overview.error || categories.error || netWorth.error || transactions.error || bills.error

  const firstError =
    overview.errorInfo ||
    categories.errorInfo ||
    netWorth.errorInfo ||
    transactions.errorInfo ||
    bills.errorInfo

  if (hasError) {
    return (
      <PageError
        message={
          firstError
            ? `${firstError.title}: ${firstError.message}${firstError.action ? ` ${firstError.action}` : ""}`
            : "Erro ao carregar o painel"
        }
        refetch={() => {
          overview.refetch()
          categories.refetch()
          netWorth.refetch()
          transactions.refetch()
          recurring.refetch()
          bills.refetch()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Painel financeiro"
        description="Sua fotografia rápida do mês: o que entrou, o que saiu, e o que merece atenção agora."
        actions={<PeriodSwitcher state={period} />}
      />

      {/* Headline: monthly result + income/expense ratio */}
      <section className="surface relative overflow-hidden p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-eyebrow">Resultado do período</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span
                className={cn(
                  "text-4xl font-semibold tracking-tight tabular-nums md:text-[40px]",
                  amountToneClass(net, { neutralOnZero: true })
                )}
              >
                {overview.loading ? (
                  <Skeleton className="h-10 w-48" />
                ) : (
                  format(net)
                )}
              </span>
              <ChangeBadge value={netChange} />
            </div>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              {net >= 0
                ? "Você está fechando o período no positivo. Mantenha o ritmo e reforce sua reserva."
                : "Você está consumindo mais do que recebeu. Confira abaixo onde estão os maiores gastos."}
            </p>
          </div>

          <div className="grid w-full gap-2 lg:w-[360px]">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500/90 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, incomeRatio))}%` }}
              />
              <div
                className="bg-rose-500/80 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, 100 - incomeRatio))}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Receitas</span>
                <span className="font-semibold tabular-nums">
                  {format(income)}
                </span>
                <ChangeBadge value={incomeChange} />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-muted-foreground">Despesas</span>
                <span className="font-semibold tabular-nums">
                  {format(expenses)}
                </span>
                <ChangeBadge value={expenseChange} reverse />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Alerts row — only renders when there is something actionable */}
      {alerts.length > 0 && (
        <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((alert, idx) => {
            const toneClasses = {
              negative:
                "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
              warning:
                "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
              info: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
            }[alert.tone]
            const Wrapper: React.ElementType = alert.href ? Link : "div"
            return (
              <Wrapper
                key={idx}
                {...(alert.href ? { href: alert.href } : {})}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed transition-colors",
                  toneClasses,
                  alert.href && "hover:brightness-110"
                )}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">{alert.text}</span>
                {alert.href && <ChevronRight className="mt-0.5 size-3.5 shrink-0" />}
              </Wrapper>
            )
          })}
        </section>
      )}

      {/* Stat tiles — separate fiat & crypto explicitly */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Patrimônio fiat"
          value={format(fiatNetWorth)}
          icon={Landmark}
          hint={`${format(accountBalance)} em conta · ${format(investments)} investido`}
          loading={overview.loading}
          href="/portfolio"
        />
        <StatTile
          label="Patrimônio cripto"
          value={format(cryptoNetWorth)}
          icon={Bitcoin}
          hint={
            summary?.usdBrlRate
              ? `USD/BRL ${summary.usdBrlRate.toFixed(2)} · valores convertidos`
              : "Valores convertidos"
          }
          tone="info"
          loading={overview.loading}
          href="/crypto"
        />
        <StatTile
          label="Patrimônio total"
          value={format(totalNetWorth)}
          icon={PiggyBank}
          hint={`Passivos: ${format(liabilities)}`}
          tone={totalNetWorth >= 0 ? "positive" : "negative"}
          loading={overview.loading}
          href="/portfolio"
        />
        <StatTile
          label="Faturas em aberto"
          value={format(openBills)}
          icon={CreditCard}
          hint={
            nextBillDueDate
              ? `Próxima ${daysUntilLabel(nextBillDueDate).toLowerCase()}`
              : "Sem faturas em aberto"
          }
          tone={openBills > 0 ? "negative" : "neutral"}
          loading={overview.loading || bills.loading}
          href="/bills"
        />
      </section>

      {/* Trend + categories */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="surface flex flex-col gap-4 p-5 lg:col-span-3">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="section-eyebrow">Patrimônio ao longo do tempo</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                {format(netWorth.data?.summary.current ?? totalNetWorth)}
              </p>
              <p className="text-xs text-muted-foreground">
                Inclui contas, investimentos e cripto, descontados passivos.
              </p>
            </div>
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver portfólio
              <ChevronRight className="size-3.5" />
            </Link>
          </header>
          {netWorth.loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (netWorth.data?.summary.points.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Ainda não há histórico suficiente para exibir.
            </p>
          ) : (
            <NetWorthChart
              history={netWorth.data!.summary.points}
              period="6M"
            />
          )}
          {!netWorth.loading && netWorth.data?.summary.valuation && (
            <div className="grid gap-2 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
              <div className="min-w-0">
                <p className="text-muted-foreground">Ativos totais</p>
                <p className="font-semibold tabular-nums">
                  {format(netWorth.data.summary.valuation.grossAssets)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground">Fiat</p>
                <p className="font-semibold tabular-nums">
                  {format(netWorth.data.summary.valuation.fiatAssets)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground">Cripto</p>
                <p className="font-semibold tabular-nums">
                  {format(netWorth.data.summary.valuation.cryptoAssets)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground">Passivos</p>
                <p className="font-semibold tabular-nums text-rose-500 dark:text-rose-400">
                  {format(netWorth.data.summary.valuation.liabilities)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="surface flex flex-col gap-3 p-5 lg:col-span-2">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="section-eyebrow">Top categorias</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                {format(categories.data?.summary.total ?? expenses)}
              </p>
              <p className="text-xs text-muted-foreground">
                Onde seu dinheiro foi no período.
              </p>
            </div>
            <Link
              href="/categories"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver tudo
              <ChevronRight className="size-3.5" />
            </Link>
          </header>
          {categories.loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : topCategories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem despesas registradas.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {topCategories.map((cat) => {
                const color = getCategoryColor(cat.name)
                const barWidth = (cat.absAmount / maxCategory) * 100
                return (
                  <li key={cat.categoryId ?? "uncategorized"}>
                    <Link
                      href={
                        cat.categoryId
                          ? `/transactions?categoryId=${encodeURIComponent(cat.categoryId)}`
                          : "/transactions"
                      }
                      className="group block"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span aria-hidden>{getCategoryEmoji(cat.name)}</span>
                          <span className="truncate font-medium text-foreground/90 group-hover:text-foreground">
                            {cat.name}
                          </span>
                        </span>
                        <span className="font-semibold tabular-nums">
                          {format(cat.absAmount)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${barWidth}%`, backgroundColor: color }}
                        />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Upcoming bills + recent transactions */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="surface flex flex-col gap-3 p-5 lg:col-span-2">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="section-eyebrow">A pagar em breve</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
                {format(recurring.data?.summary.totalMonthly ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                Soma dos compromissos recorrentes mensais.
              </p>
            </div>
            <Link
              href="/recurring"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver todos
              <ChevronRight className="size-3.5" />
            </Link>
          </header>
          {recurring.loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : upcomingBills.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma despesa recorrente cadastrada.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {upcomingBills.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                      {getCategoryEmoji(rule.category ?? "")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{rule.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {daysUntilLabel(rule.nextDate)} · {formatDate(rule.nextDate)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {format(Math.abs(rule.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface flex flex-col gap-3 p-5 lg:col-span-3">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="section-eyebrow">Movimentações recentes</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Últimas transações conciliadas no período.
              </p>
            </div>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver tudo
              <ChevronRight className="size-3.5" />
            </Link>
          </header>
          {transactions.loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (transactions.data?.results.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem movimentações no período selecionado.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {transactions.data!.results.slice(0, 8).map((tx) => {
                const isInflow = tx.direction === "INFLOW"
                return (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          isInflow
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-rose-500/10 text-rose-500"
                        )}
                      >
                        {isInflow ? (
                          <TrendingUp className="size-3.5" />
                        ) : (
                          <TrendingDown className="size-3.5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tx.description}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(tx.date)} · {tx.categoryName || "Sem categoria"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        amountToneClass(isInflow ? 1 : -1)
                      )}
                    >
                      {formatSigned(
                        isInflow ? Math.abs(tx.amount) : -Math.abs(tx.amount),
                        "always"
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Quick links — keep rooted in user goals, not feature inventory */}
      <section className="grid gap-3 md:grid-cols-3">
        {[
          {
            href: "/cash-flow",
            icon: Receipt,
            title: "Fluxo de caixa",
            desc: "Veja entradas e saídas mês a mês.",
          },
          {
            href: "/projection",
            icon: Sparkles,
            title: "Projeção de saldo",
            desc: "Como seu saldo evolui adiante.",
          },
          {
            href: "/recurring",
            icon: CalendarClock,
            title: "Custos recorrentes",
            desc: "Gerencie assinaturas e fixos.",
          },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="surface group flex items-center gap-3 p-4 transition-colors hover:bg-accent/40"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </section>
    </div>
  )
}
