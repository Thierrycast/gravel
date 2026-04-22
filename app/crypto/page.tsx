"use client"

import type { ComponentType } from "react"
import { AlertTriangle, Bitcoin, Coins, DollarSign, Wallet } from "lucide-react"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useApi } from "@/hooks/use-api"
import {
  amountToneClass,
  formatCurrency,
  formatNumber,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/format"
import { cn } from "@/lib/utils"

interface CryptoResponse {
  summary: {
    totalValueBrl: number
    totalValueUsd: number
    totalUnrealizedPnlBrl: number
    totalUnrealizedPnlUsd: number
    assetCount: number
    usdBrlRate: number
    costBasisMissing: boolean
    costBasisMissingAssets: number
  }
  results: Array<{
    asset: string
    quantity: number
    averagePriceBrl: number | null
    averagePriceUsd: number | null
    currentPriceBrl: number | null
    currentPriceUsd: number | null
    valueBrl: number | null
    valueUsd: number | null
    unrealizedPnlBrl: number | null
    unrealizedPnlUsd: number | null
    portfolioSharePercent: number
    change24hPercent: number | null
    tradeCount: number
    costBasisMissing: boolean
    missingCostBasisQuantity: number
    firstTradeAt: string | null
    lastTradeAt: string | null
  }>
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 8,
})

function formatUsd(value: number | null | undefined) {
  return usdFormatter.format(value ?? 0)
}

function formatQuantity(value: number | null | undefined) {
  return quantityFormatter.format(value ?? 0)
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  muted = false,
}: {
  label: string
  value: string
  hint?: string
  icon: ComponentType<{ className?: string }>
  tone?: "neutral" | "positive" | "negative" | "info"
  muted?: boolean
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    negative: "text-rose-500 dark:text-rose-400",
    info: "text-sky-500 dark:text-sky-400",
  }[tone]

  return (
    <section className={cn("surface flex flex-col gap-2 p-4", muted && "opacity-80")}>
      <div className="flex items-center justify-between gap-2">
        <p className="section-eyebrow">{label}</p>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <p className={cn("text-[22px] font-semibold tracking-tight tabular-nums", toneClass)}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{hint ?? "\u00A0"}</p>
    </section>
  )
}

export default function CryptoPage() {
  const crypto = useApi<CryptoResponse>("/api/crypto")

  if (crypto.loading) {
    return <LoadingState />
  }

  if (crypto.error || !crypto.data) {
    return <PageError message={crypto.error ?? "Erro ao carregar carteira cripto"} refetch={crypto.refetch} />
  }

  const { summary, results } = crypto.data
  const pnlValue = summary.totalUnrealizedPnlBrl
  const pnlTone =
    pnlValue > 0 ? "positive" : pnlValue < 0 ? "negative" : "neutral"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Cripto"
        title="Carteira cripto"
        description="Posições isoladas do restante do patrimônio, com valorização marcada em BRL e USD."
        actions={
          <Badge variant="outline" className="h-8 rounded-full px-3 text-xs font-medium">
            USD/BRL {summary.usdBrlRate.toFixed(2)} · cotação de hoje
          </Badge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Valor total (BRL)"
          value={formatCurrency(summary.totalValueBrl)}
          hint="Carteira convertida para reais"
          icon={Wallet}
          tone="info"
        />
        <MetricCard
          label="Valor total (USD)"
          value={formatUsd(summary.totalValueUsd)}
          hint="Base original de cotação"
          icon={DollarSign}
        />
        <MetricCard
          label="PnL não realizado"
          value={formatSignedCurrency(summary.totalUnrealizedPnlBrl, "always")}
          hint={
            summary.costBasisMissing
              ? "Parcial: parte da carteira está sem custo de aquisição."
              : "Ganho ou perda apenas nas posições abertas."
          }
          icon={Bitcoin}
          tone={pnlTone}
          muted={summary.costBasisMissing}
        />
        <MetricCard
          label="Ativos"
          value={formatNumber(summary.assetCount)}
          hint="Posições com valor de mercado"
          icon={Coins}
        />
      </section>

      {summary.costBasisMissing ? (
        <section className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">PnL pode estar incompleto</p>
            <p className="text-xs leading-relaxed opacity-90">
              PnL pode estar incompleto — importe seu histórico de trades para precisão.
              {summary.costBasisMissingAssets > 1
                ? ` ${summary.costBasisMissingAssets} posições estão com custo parcial ou ausente.`
                : " 1 posição está com custo parcial ou ausente."}
            </p>
          </div>
        </section>
      ) : null}

      <section className="surface overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4">
          <div>
            <p className="section-eyebrow">Posições</p>
            <h2 className="text-sm font-semibold tracking-tight">
              Carteira atual por ativo
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {results.length} {results.length === 1 ? "ativo" : "ativos"} listados
          </p>
        </div>

        {results.length === 0 ? (
          <div className="px-4 py-10 text-sm text-muted-foreground">
            Nenhuma posição cripto encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="text-right">Preço atual</TableHead>
                  <TableHead className="text-right">Valor (BRL)</TableHead>
                  <TableHead className="text-right">% do portfólio</TableHead>
                  <TableHead className="text-right">Variação 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((asset) => (
                  <TableRow key={asset.asset}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{asset.asset}</span>
                        {asset.costBasisMissing ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400">
                            custo incompleto
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {asset.tradeCount} {asset.tradeCount === 1 ? "trade" : "trades"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatQuantity(asset.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {asset.costBasisMissing || asset.averagePriceBrl == null
                        ? "—"
                        : formatCurrency(asset.averagePriceBrl)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {asset.currentPriceBrl == null
                        ? "—"
                        : formatCurrency(asset.currentPriceBrl)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {asset.valueBrl == null ? "—" : formatCurrency(asset.valueBrl)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {asset.valueBrl == null
                        ? "—"
                        : formatSignedPercent(asset.portfolioSharePercent).replace("+", "")}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        amountToneClass(asset.change24hPercent)
                      )}
                    >
                      {asset.change24hPercent == null
                        ? "—"
                        : formatSignedPercent(asset.change24hPercent)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
