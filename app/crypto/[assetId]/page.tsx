import { Suspense } from "react"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Bitcoin, TrendingDown, TrendingUp, Activity, DollarSign } from "lucide-react"
import { Prisma } from "@prisma/client"

import { getCryptoAssetMetrics } from "@/lib/domain/analytics"
import { getUsdBrlRate } from "@/lib/exchange-rate"
import { prisma } from "@/lib/prisma"
import { formatCurrency } from "@/lib/format"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { CryptoAssetChart } from "./crypto-asset-chart"

// ─── Helpers ────────────────────────────────────────────────
const USD_QUOTES = new Set(["USDT", "FDUSD", "USDC", "BUSD", "USD"])

function toBrl(
  value: Prisma.Decimal | null | undefined,
  quoteAsset: string | null | undefined,
  rate: Prisma.Decimal
): number | null {
  if (value == null) return null
  if (quoteAsset?.toUpperCase() === "BRL") return value.toNumber()
  if (!quoteAsset || USD_QUOTES.has(quoteAsset.toUpperCase())) return value.mul(rate).toNumber()
  return null
}

const qtyFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 })

// ─── Server Data Component ─────────────────────────────────
async function AssetOverview({ assetId }: { assetId: string }) {
  const searchParams = new URLSearchParams()
  searchParams.set("asset", assetId)

  const [metrics, usdBrl] = await Promise.all([
    getCryptoAssetMetrics(searchParams),
    getUsdBrlRate(),
  ])

  const asset = metrics.results[0]
  if (!asset) notFound()

  const rate = new Prisma.Decimal(usdBrl)

  // Convert Decimals → numbers in BRL
  const currentPriceBrl = toBrl(asset.currentPrice, asset.quoteAsset, rate)
  const avgPriceBrl = toBrl(asset.averageCost, asset.quoteAsset, rate)
  const valueBrl = toBrl(asset.currentValue, asset.quoteAsset, rate)
  const pnlBrl = toBrl(asset.unrealizedPnl, asset.quoteAsset, rate)
  const isPositive = (pnlBrl ?? 0) >= 0

  // Price history for the chart (raw Decimal → number)
  const history = await prisma.binanceAssetPriceSnapshot.findMany({
    where: { asset: assetId },
    orderBy: { fetchedAt: "asc" },
    select: { fetchedAt: true, price: true, quoteAsset: true },
  })

  const chartData = history.map((p) => ({
    date: p.fetchedAt.toISOString().split("T")[0],
    price: toBrl(p.price, p.quoteAsset, rate) ?? Number(p.price),
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Back + Title */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="h-8 w-8">
          <Link href="/crypto">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={asset.asset}
          description={`${qtyFmt.format(asset.quantity.toNumber())} unidades em carteira`}
        />
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Preço Atual"
          value={currentPriceBrl != null ? formatCurrency(currentPriceBrl) : "—"}
          icon={Activity}
        />
        <MetricCard
          label="Preço Médio"
          value={
            asset.costBasisMissing
              ? "N/A"
              : avgPriceBrl != null
                ? formatCurrency(avgPriceBrl)
                : "—"
          }
          icon={DollarSign}
        />
        <MetricCard
          label="Valor de Mercado"
          value={valueBrl != null ? formatCurrency(valueBrl) : "—"}
          icon={Bitcoin}
        />
        <MetricCard
          label="PnL Não Realizado"
          value={
            asset.costBasisMissing
              ? "N/A"
              : pnlBrl != null
                ? formatCurrency(pnlBrl)
                : "—"
          }
          icon={isPositive ? TrendingUp : TrendingDown}
          tone={isPositive ? "positive" : "negative"}
        />
      </div>

      {/* Chart + Sidebar */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <section className="surface flex flex-col gap-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">Histórico de Preço</h2>
            {chartData.length > 0 ? (
              <CryptoAssetChart data={chartData} />
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground border border-dashed rounded-xl">
                Sem dados históricos disponíveis
              </div>
            )}
          </section>
        </div>

        <div className="md:col-span-1 flex flex-col gap-4">
          <section className="surface flex flex-col gap-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">Métricas de Trading</h2>
            <div className="flex flex-col gap-4">
              <InfoRow label="Trades Totais" value={String(asset.tradeCount)} />
              <InfoRow
                label="Primeiro Trade"
                value={
                  asset.firstTradeAt
                    ? new Date(asset.firstTradeAt).toLocaleDateString("pt-BR")
                    : "N/A"
                }
                border
              />
              <InfoRow
                label="Último Trade"
                value={
                  asset.lastTradeAt
                    ? new Date(asset.lastTradeAt).toLocaleDateString("pt-BR")
                    : "N/A"
                }
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Small UI pieces ────────────────────────────────────────

function InfoRow({ label, value, border = true }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={cn("flex justify-between items-center pb-2", border && "border-b")}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone?: "neutral" | "positive" | "negative"
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    negative: "text-rose-500 dark:text-rose-400",
  }[tone]

  return (
    <section className="surface flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", toneClass)}>
        {value}
      </p>
    </section>
  )
}

// ─── Loading skeleton ───────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-96 md:col-span-2 rounded-xl" />
        <Skeleton className="h-96 md:col-span-1 rounded-xl" />
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────

export default async function CryptoAssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>
}) {
  const { assetId } = await params
  return (
    <Suspense fallback={<LoadingState />}>
      <AssetOverview assetId={assetId.toUpperCase()} />
    </Suspense>
  )
}
