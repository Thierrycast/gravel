"use client"

import type { ComponentType } from "react"
import {
  Bitcoin,
  CreditCard,
  Landmark,
  Wallet,
} from "lucide-react"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { amountToneClass } from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"
import { NetWorthChart } from "@/components/dashboard/net-worth-chart"
import { usePeriod } from "@/hooks/use-period"
import { PeriodSwitcher } from "@/components/period-switcher"

interface PortfolioItem {
  name: string
  type: string
  value: number
  sharePercent: number
}

interface LiabilityItem {
  name: string
  type: string
  value: number
  percentage: number
}

interface PortfolioResponse {
  netWorth: number
  liabilities: {
    total: number
    items: LiabilityItem[]
  }
  breakdown: {
    fiat: {
      liquid: number
      investments: number
      total: number
      netWorth: number
      items: PortfolioItem[]
    }
    crypto: {
      total: number
      netWorth: number
      items: PortfolioItem[]
      usdBrlRate: number
    }
  }
}

const compositionPalette = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
]

type DisplayCurrency = "BRL" | "USD"

const displayCurrencyFormatters: Record<DisplayCurrency, Intl.NumberFormat> = {
  BRL: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }),
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }),
}

function normalizeDisplayZero(value: number) {
  return Math.abs(value) < 0.005 ? 0 : value
}

function formatMoneyWithRate(
  valueBrl: number | null | undefined,
  currency: DisplayCurrency,
  usdBrlRate: number,
  isPrivate: boolean
) {
  if (isPrivate) return "••••"
  if (valueBrl == null || !Number.isFinite(valueBrl)) return "—"

  const displayValue =
    currency === "USD" ? valueBrl / usdBrlRate : valueBrl
  return displayCurrencyFormatters[currency].format(
    normalizeDisplayZero(displayValue)
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-40 rounded-xl" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>

      <Skeleton className="h-[220px] rounded-xl" />
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone = "neutral",
  icon: Icon,
}: {
  label: string
  value: string
  tone?: "neutral" | "positive" | "negative" | "info"
  icon: ComponentType<{ className?: string }>
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    negative: "text-rose-500 dark:text-rose-400",
    info: "text-sky-500 dark:text-sky-400",
  }[tone]

  return (
    <div className="surface flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="section-eyebrow">{label}</p>
        <p className={cn("mt-1 text-lg font-semibold tracking-tight tabular-nums", toneClass)}>
          {value}
        </p>
      </div>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
    </div>
  )
}

function CompositionBar({ items }: { items: PortfolioItem[] }) {
  const visible = items.slice(0, 6)

  if (visible.length === 0) {
    return <div className="h-2 w-full rounded-full bg-muted" />
  }

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {visible.map((item, index) => (
        <div
          key={item.name}
          className={compositionPalette[index % compositionPalette.length]}
          style={{ width: `${Math.max(item.sharePercent, 4)}%` }}
          title={`${item.name}: ${item.sharePercent.toFixed(1)}%`}
        />
      ))}
    </div>
  )
}

function PortfolioColumn({
  eyebrow,
  title,
  subtitle,
  total,
  items,
  stats,
  format,
}: {
  eyebrow: string
  title: string
  subtitle: string
  total: number
  items: PortfolioItem[]
  stats: React.ReactNode
  format: (val: number) => string
}) {
  return (
    <section className="surface flex flex-col gap-5 p-5 min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <p className="section-eyebrow truncate">{eyebrow}</p>
            <h2 className="text-lg font-semibold tracking-tight truncate">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
          </div>
          <Badge variant="outline" className="rounded-full px-3 shrink-0">
            {items.length} {items.length === 1 ? "item" : "itens"}
          </Badge>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between min-w-0">
          <div className="min-w-0">
            <p className="section-eyebrow truncate">Total</p>
            <p className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums truncate">
              {format(total)}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground min-w-0">{stats}</div>
        </div>

        <CompositionBar items={items} />
      </div>

      <div className="space-y-3 min-w-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
        ) : (
          items.map((item, index) => (
            <div key={`${item.type}:${item.name}`} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.sharePercent.toFixed(1)}% da coluna
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {format(item.value)}
                </p>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    compositionPalette[index % compositionPalette.length]
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, item.sharePercent))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function getLiabilityLabel(type: string) {
  if (type === "loan") return "Empréstimo"
  if (type === "credit") return "Cartão / crédito"
  return "Passivo"
}

interface NetWorthPoint {
  date: string
  netWorth: number
  assets?: number | null
  liabilities?: number | null
}

interface NetWorthHistoryResponse {
  summary: { points: NetWorthPoint[] }
  results: NetWorthPoint[]
}

export default function PortfolioPage() {
  const { currency, isPrivate } = useCurrency()
  const portfolio = useApi<PortfolioResponse>("/api/portfolio")
  const netWorthPeriod = usePeriod("12m")
  const netWorthHistory = useApi<NetWorthHistoryResponse>(
    "/api/domain/metrics/net-worth",
    netWorthPeriod.params,
  )

  if (portfolio.loading) {
    return <LoadingState />
  }

  if (portfolio.error || !portfolio.data) {
    return (
      <PageError
        message={portfolio.error ?? "Erro ao carregar portfólio"}
        refetch={portfolio.refetch}
      />
    )
  }

  const { breakdown, liabilities, netWorth } = portfolio.data
  const usdBrlRate = breakdown.crypto.usdBrlRate
  const formatPortfolioMoney = (value: number | null | undefined) =>
    formatMoneyWithRate(value, currency, usdBrlRate, isPrivate)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Portfólio"
        title="Patrimônio consolidado"
        description="Visão separada entre patrimônio fiat e carteira cripto, com passivos destacados fora das posições."
        actions={
          <Badge variant="outline" className="h-8 rounded-full px-3 text-xs font-medium">
            Valores em {currency} · USD/BRL {usdBrlRate.toFixed(2)}
          </Badge>
        }
      />

      <section className="surface flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-eyebrow">Patrimônio líquido total</p>
            <p
              className={cn(
                "mt-1 text-4xl font-semibold tracking-tight tabular-nums md:text-[40px]",
                amountToneClass(netWorth, { neutralOnZero: true })
              )}
            >
              {formatPortfolioMoney(netWorth)}
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              O patrimônio líquido é calculado somando seus ativos (fiat e cripto) e subtraindo os passivos em aberto (faturas de cartões e empréstimos).
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryStat
              label="Fiat total"
              value={formatPortfolioMoney(breakdown.fiat.total)}
              tone="info"
              icon={Landmark}
            />
            <SummaryStat
              label="Cripto total"
              value={formatPortfolioMoney(breakdown.crypto.total)}
              tone="neutral"
              icon={Bitcoin}
            />
            <SummaryStat
              label="Passivos"
              value={formatPortfolioMoney(liabilities.total)}
              tone="negative"
              icon={CreditCard}
            />
            <SummaryStat
              label="USD/BRL"
              value={breakdown.crypto.usdBrlRate.toFixed(2)}
              tone="neutral"
              icon={Wallet}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PortfolioColumn
          eyebrow="Fiat"
          title="Caixa + investimentos"
          subtitle="Saldo bancário e aplicações tradicionais, sem misturar exposição cripto."
          total={breakdown.fiat.total}
          items={breakdown.fiat.items}
          format={formatPortfolioMoney}
          stats={
            <>
              <div className="flex items-center justify-between gap-4">
                <span>Liquidez</span>
                <span className="font-medium tabular-nums">
                  {formatPortfolioMoney(breakdown.fiat.liquid)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Investimentos</span>
                <span className="font-medium tabular-nums">
                  {formatPortfolioMoney(breakdown.fiat.investments)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Patrimônio líquido fiat</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    amountToneClass(breakdown.fiat.netWorth, {
                      neutralOnZero: true,
                    })
                  )}
                >
                  {formatPortfolioMoney(breakdown.fiat.netWorth)}
                </span>
              </div>
            </>
          }
        />

        <PortfolioColumn
          eyebrow="Cripto"
          title="Carteira digital"
          subtitle={`Base cripto em USD/USDT, exibida em ${currency} com USD/BRL ${usdBrlRate.toFixed(2)}.`}
          total={breakdown.crypto.total}
          items={breakdown.crypto.items}
          format={formatPortfolioMoney}
          stats={
            <>
              <div className="flex items-center justify-between gap-4">
                <span>Exposição líquida</span>
                <span className="font-medium tabular-nums">
                  {formatPortfolioMoney(breakdown.crypto.netWorth)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Ativos acompanhados</span>
                <span className="font-medium tabular-nums">
                  {breakdown.crypto.items.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Alocação média</span>
                <span className="font-medium tabular-nums">
                  {breakdown.crypto.items.length > 0
                    ? `${(100 / breakdown.crypto.items.length).toFixed(1)}%`
                    : "0%"}
                </span>
              </div>
            </>
          }
        />
      </section>

      {/* Net Worth history chart */}
      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow">Histórico</p>
            <h2 className="text-lg font-semibold tracking-tight">
              Evolução do patrimônio
            </h2>
          </div>
          <PeriodSwitcher
            state={netWorthPeriod}
            options={["mtd", "90d", "180d", "12m", "ytd", "all"]}
          />
        </div>
        <div className="h-72 w-full">
          {netWorthHistory.loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <NetWorthChart
              history={netWorthHistory.data?.results ?? []}
              period={
                netWorthPeriod.period === "all"
                  ? "ALL"
                  : netWorthPeriod.period === "mtd"
                    ? "1M"
                    : netWorthPeriod.period === "90d"
                      ? "3M"
                      : netWorthPeriod.period === "180d"
                        ? "6M"
                        : "1Y"
              }
            />
          )}
        </div>
      </section>

      <section className="surface flex flex-col gap-4 p-5">
        <div>
          <p className="section-eyebrow">Passivos</p>
          <h2 className="text-lg font-semibold tracking-tight">
            Cartões e empréstimos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dívidas abertas separadas visualmente do patrimônio para não inflarem a leitura das posições.
          </p>
        </div>

        {liabilities.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum passivo em aberto.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liabilities.items.map((item) => (
              <div
                key={`${item.type}:${item.name}`}
                className="rounded-xl border border-border/60 bg-background/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getLiabilityLabel(item.type)}
                    </p>
                  </div>
                  <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-3 text-lg font-semibold tabular-nums text-rose-500 dark:text-rose-400">
                  {formatPortfolioMoney(item.value)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.percentage.toFixed(1)}% do total de passivos
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
