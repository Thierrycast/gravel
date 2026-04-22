"use client"

import type { ComponentType } from "react"
import {
  Bitcoin,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
} from "lucide-react"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { amountToneClass, formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"

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
}: {
  eyebrow: string
  title: string
  subtitle: string
  total: number
  items: PortfolioItem[]
  stats: React.ReactNode
}) {
  return (
    <section className="surface flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-eyebrow">{eyebrow}</p>
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Badge variant="outline" className="rounded-full px-3">
            {items.length} {items.length === 1 ? "item" : "itens"}
          </Badge>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-eyebrow">Total</p>
            <p className="mt-1 text-[28px] font-semibold tracking-tight tabular-nums">
              {formatCurrency(total)}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground">{stats}</div>
        </div>

        <CompositionBar items={items} />
      </div>

      <div className="space-y-3">
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
                  {formatCurrency(item.value)}
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

export default function PortfolioPage() {
  const portfolio = useApi<PortfolioResponse>("/api/portfolio")

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Portfólio"
        title="Patrimônio consolidado"
        description="Visão separada entre patrimônio fiat e carteira cripto, com passivos destacados fora das posições."
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
              {formatCurrency(netWorth)}
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              O topo já soma patrimônio fiat e cripto, mas a composição abaixo mantém os dois universos separados.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryStat
              label="Fiat total"
              value={formatCurrency(breakdown.fiat.total)}
              tone="info"
              icon={Landmark}
            />
            <SummaryStat
              label="Cripto total"
              value={formatCurrency(breakdown.crypto.total)}
              tone="neutral"
              icon={Bitcoin}
            />
            <SummaryStat
              label="Passivos"
              value={formatCurrency(liabilities.total)}
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
          stats={
            <>
              <div className="flex items-center justify-between gap-4">
                <span>Liquidez</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(breakdown.fiat.liquid)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Investimentos</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(breakdown.fiat.investments)}
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
                  {formatCurrency(breakdown.fiat.netWorth)}
                </span>
              </div>
            </>
          }
        />

        <PortfolioColumn
          eyebrow="Cripto"
          title="Carteira digital"
          subtitle={`Valores convertidos para BRL com USD/BRL ${breakdown.crypto.usdBrlRate.toFixed(2)}.`}
          total={breakdown.crypto.total}
          items={breakdown.crypto.items}
          stats={
            <>
              <div className="flex items-center justify-between gap-4">
                <span>Exposição líquida</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(breakdown.crypto.netWorth)}
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
                  {formatCurrency(item.value)}
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
