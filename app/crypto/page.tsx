"use client"

import { useState, type ComponentType } from "react"
import Link from "next/link"
import { AlertTriangle, Bitcoin, Coins, DollarSign, Wallet, TrendingUp, TrendingDown, Activity } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, Pie, PieChart, Cell } from "recharts"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useApi } from "@/hooks/use-api"
import {
  amountToneClass,
  formatNumber,
  formatSignedPercent,
} from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"

interface CryptoResponse {
  summary: {
    totalValueBrl: number
    totalValueUsd: number
    totalUnrealizedPnlBrl: number
    totalUnrealizedPnlUsd: number
    totalRealizedPnlBrl: number
    totalRealizedPnlUsd: number
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
    realizedPnlBrl: number | null
    realizedPnlUsd: number | null
    portfolioSharePercent: number
    change24hPercent: number | null
    tradeCount: number
    costBasisMissing: boolean
    missingCostBasisQuantity: number
    firstTradeAt: string | null
    lastTradeAt: string | null
    imageUrl: string | null
  }>
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const quantityFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 8,
})

function formatQuantity(value: number | null | undefined) {
  return quantityFormatter.format(value ?? 0)
}

type CryptoAsset = CryptoResponse["results"][number]

function getCostBasisBrl(asset: CryptoAsset): number | null {
  if (
    asset.costBasisMissing ||
    asset.valueBrl == null ||
    asset.unrealizedPnlBrl == null
  ) {
    return null
  }
  return asset.valueBrl - asset.unrealizedPnlBrl
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

function InsightsLine({ results }: { results: CryptoAsset[] }) {
  const { format } = useCurrency()
  
  if (results.length === 0) return null

  const maxShareAsset = results.reduce((max, asset) => 
    asset.portfolioSharePercent > max.portfolioSharePercent ? asset : max
  , results[0])

  const validPnlAssets = results.filter(a => a.unrealizedPnlBrl != null)
  const bestAsset = validPnlAssets.length > 0 ? validPnlAssets.reduce((max, asset) => 
    (asset.unrealizedPnlBrl! > max.unrealizedPnlBrl!) ? asset : max
  , validPnlAssets[0]) : null

  const worstAsset = validPnlAssets.length > 0 ? validPnlAssets.reduce((min, asset) => 
    (asset.unrealizedPnlBrl! < min.unrealizedPnlBrl!) ? asset : min
  , validPnlAssets[0]) : null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card size="sm">
        <CardContent className="pt-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            Maior posição
            {maxShareAsset.portfolioSharePercent > 50 && (
              <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px] text-amber-500 border-amber-500/30">
                <AlertTriangle className="size-3 mr-1" /> Concentração
              </Badge>
            )}
          </p>
          <p className="text-sm font-medium">{maxShareAsset.asset} <span className="text-muted-foreground font-normal">({formatSignedPercent(maxShareAsset.portfolioSharePercent).replace('+', '')} da carteira)</span></p>
        </CardContent>
      </Card>
      {bestAsset && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              Melhor ativo <TrendingUp className="size-3 text-emerald-500 ml-auto" />
            </p>
            <p className="text-sm font-medium">{bestAsset.asset} <span className="text-emerald-500">({bestAsset.unrealizedPnlBrl! > 0 ? "+" : ""}{format(bestAsset.unrealizedPnlBrl!)})</span></p>
          </CardContent>
        </Card>
      )}
      {worstAsset && (
        <Card size="sm">
          <CardContent className="pt-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
              Pior ativo <TrendingDown className="size-3 text-rose-500 ml-auto" />
            </p>
            <p className="text-sm font-medium">{worstAsset.asset} <span className="text-rose-500">({worstAsset.unrealizedPnlBrl! > 0 ? "+" : ""}{format(worstAsset.unrealizedPnlBrl!)})</span></p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

type CryptoHistoryResponse = {
  summary?: {
    days: number
    changeBrl: number
    changePct: number | null
    peakBrl: number
    troughBrl: number
  }
  results?: Array<{ date: string; valueBrl: number }>
}

function HistoryChart() {
  const [days, setDays] = useState("90")
  const { data, loading, error } = useApi<CryptoHistoryResponse>(
    "/api/crypto/history",
    { days },
  )
  const { format } = useCurrency()

  const summary = data?.summary
  const results = data?.results || []

  const toneClass = summary && summary.changeBrl >= 0 ? "text-emerald-500" : "text-rose-500"

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle>Evolução da carteira</CardTitle>
          <CardDescription>
            {loading ? "Carregando..." : summary ? (
              <span className="flex items-center gap-1.5">
                <span className={cn("font-medium", toneClass)}>
                  {summary.changeBrl > 0 ? "+" : ""}{format(summary.changeBrl)}
                  {summary.changePct != null
                    ? ` (${summary.changePct > 0 ? "+" : ""}${summary.changePct.toFixed(2)}%)`
                    : ""}
                </span>
                <span>no período</span>
              </span>
            ) : "Erro ao carregar histórico"}
          </CardDescription>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="180">180 dias</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        {loading ? (
          <Skeleton className="h-[250px] w-full mt-4" />
        ) : error || results.length < 2 ? (
          <EmptyState
            title="Histórico insuficiente"
            description="Os snapshots são acumulados a cada sincronização. Continue usando o app para gerar histórico."
            icon={Activity}
            variant="compact"
            className="h-[250px]"
          />
        ) : (
          <ChartContainer config={{ value: { label: "Valor", color: "hsl(var(--primary))" } }} className="h-[250px] w-full mt-4">
            <AreaChart data={results} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8} 
                minTickGap={32}
                tickFormatter={(value) => {
                  const parts = value.split("-")
                  if (parts.length === 3) {
                    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
                    return new Intl.DateTimeFormat("pt-BR", { month: "short", day: "numeric" }).format(date)
                  }
                  return value
                }}
              />
              <ChartTooltip 
                content={
                  <ChartTooltipContent 
                    labelFormatter={(value) => {
                      const parts = value.split("-")
                      if (parts.length === 3) {
                        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
                        return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date)
                      }
                      return value
                    }}
                    formatter={(value: unknown) => format(Number(value))}
                  />
                } 
              />
              <Area 
                type="monotone" 
                dataKey="valueBrl" 
                stroke="var(--color-value)" 
                fillOpacity={1} 
                fill="url(#fillValue)" 
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function AllocationDonut({ results }: { results: CryptoAsset[] }) {
  const { format } = useCurrency()
  
  if (results.length === 0) return null

  const sorted = [...results].sort((a, b) => (b.valueBrl || 0) - (a.valueBrl || 0))
  const top6 = sorted.slice(0, 6)
  const others = sorted.slice(6)

  const data = top6.map(a => ({
    name: a.asset,
    value: a.valueBrl || 0,
    share: a.portfolioSharePercent
  }))

  if (others.length > 0) {
    const othersValue = others.reduce((sum, a) => sum + (a.valueBrl || 0), 0)
    const othersShare = others.reduce((sum, a) => sum + a.portfolioSharePercent, 0)
    data.push({ name: "Outros", value: othersValue, share: othersShare })
  }

  const chartConfig = Object.fromEntries(
    data.map((item, index) => {
      const color = item.name === "Outros" ? "hsl(var(--muted-foreground))" : `hsl(var(--chart-${(index % 5) + 1}))`
      return [item.name, { label: item.name, color }]
    })
  ) as ChartConfig

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle>Alocação</CardTitle>
        <CardDescription>Distribuição da carteira atual</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-4">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[200px] mt-2">
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent hideLabel formatter={(value: unknown, name: unknown) => `${String(name)}: ${format(Number(value))}`} />}
            />
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              strokeWidth={5}
            >
              {data.map((entry) => (
                <Cell key={`cell-${entry.name}`} fill={`var(--color-${entry.name})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="grid grid-cols-2 gap-2 mt-6 text-xs">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: `var(--color-${item.name})` }} />
              <span className="truncate flex-1 font-medium">{item.name}</span>
              <span className="text-muted-foreground">{item.share.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PnlList({ results }: { results: CryptoAsset[] }) {
  const { format } = useCurrency()
  const sorted = [...results]
    .sort((a, b) => (b.unrealizedPnlBrl || 0) - (a.unrealizedPnlBrl || 0))

  if (sorted.length === 0) return null
  
  const maxAbs = Math.max(...sorted.map(a => Math.abs(a.unrealizedPnlBrl || 0)))

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>P&L por ativo</CardTitle>
        <CardDescription>Lucro e prejuízo não realizado nas posições abertas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {sorted.map(asset => {
          const val = asset.unrealizedPnlBrl || 0
          const isPos = val >= 0
          const widthPct = maxAbs === 0 ? 0 : (Math.abs(val) / maxAbs) * 100
          
          return (
            <div key={asset.asset} className="flex items-center gap-4 text-sm">
              <div className="w-20 font-medium shrink-0 flex items-center gap-2 truncate">
                <Avatar className="size-6">
                  <AvatarImage src={asset.imageUrl || undefined} />
                  <AvatarFallback className="bg-muted text-[10px]">{asset.asset.slice(0,2)}</AvatarFallback>
                </Avatar>
                {asset.asset}
              </div>
              <div className="flex-1 flex items-center h-5">
                <div className="flex-1 flex justify-end h-full relative">
                  {!isPos && (
                    <div 
                      className="h-full bg-rose-500/20 dark:bg-rose-500/30 rounded-l absolute right-0"
                      style={{ width: `${widthPct}%` }}
                    />
                  )}
                </div>
                <div className="w-px h-full bg-border shrink-0 mx-1" />
                <div className="flex-1 h-full relative">
                  {isPos && (
                    <div 
                      className="h-full bg-emerald-500/20 dark:bg-emerald-500/30 rounded-r absolute left-0"
                      style={{ width: `${widthPct}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="w-28 text-right flex flex-col shrink-0">
                <span className={cn("font-medium tabular-nums", amountToneClass(val))}>
                  {val === 0 ? "—" : format(val)}
                </span>
                {asset.costBasisMissing ? (
                  <span className="text-[10px] text-amber-500 font-medium">sem custo base</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {asset.averagePriceBrl && val !== 0 ? (
                      formatSignedPercent(val / (asset.quantity * asset.averagePriceBrl) * 100)
                    ) : null}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}


export default function CryptoPage() {
  const { format, currency } = useCurrency()
  const crypto = useApi<CryptoResponse>("/api/crypto")
  const [editingAsset, setEditingAsset] = useState<{ asset: string, currentCost: number } | null>(null)
  const [newCost, setNewCost] = useState("")
  const [isSaving, setIsSaving] = useState(false)

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
  const investmentValueBrl = results.reduce(
    (total, asset) => total + (getCostBasisBrl(asset) ?? 0),
    0
  )
  const investmentIsPartial = results.some(
    (asset) => getCostBasisBrl(asset) == null
  )

  async function handleSaveCost() {
    if (!editingAsset || !newCost) return
    setIsSaving(true)
    try {
      const res = await fetch("/api/crypto/cost-basis", {
        method: "POST",
        body: JSON.stringify({
          asset: editingAsset.asset,
          averageCost: parseFloat(newCost),
        }),
      })
      if (res.ok) {
        crypto.refetch()
        setEditingAsset(null)
        setNewCost("")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

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
          label={`Valor total (${currency})`}
          value={format(summary.totalValueBrl)}
          hint={currency === "BRL" ? "Carteira convertida para reais" : "Carteira convertida para dólares"}
          icon={Wallet}
          tone="info"
        />
        <MetricCard
          label={`Investimento apurado (${currency})`}
          value={format(investmentValueBrl)}
          hint={
            investmentIsPartial
              ? "Parcial: há ativos sem custo apurado"
              : "Soma do custo exibido por ativo"
          }
          icon={DollarSign}
          muted={investmentIsPartial}
        />
        <MetricCard
          label="PnL não realizado"
          value={format(summary.totalUnrealizedPnlBrl)}
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

      <InsightsLine results={results} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <HistoryChart />
        </div>
        <div>
          <AllocationDonut results={results} />
        </div>
      </div>

      <PnlList results={results} />

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
          <>
            <div className="space-y-3 p-3 md:hidden">
              {results.map((asset) => {
                const costBasisBrl = getCostBasisBrl(asset)
                return (
                  <article key={asset.asset} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarImage src={asset.imageUrl || undefined} />
                          <AvatarFallback className="bg-muted text-xs">
                            {asset.asset.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link
                            href={`/crypto/${asset.asset.toLowerCase()}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {asset.asset}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatQuantity(asset.quantity)} unidades
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {asset.valueBrl == null ? "—" : format(asset.valueBrl)}
                      </p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Custo apurado</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {costBasisBrl == null ? "—" : format(costBasisBrl)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">PnL não realizado</dt>
                        <dd
                          className={cn(
                            "mt-0.5 font-medium tabular-nums",
                            amountToneClass(asset.unrealizedPnlBrl)
                          )}
                        >
                          {asset.unrealizedPnlBrl == null
                            ? "—"
                            : format(asset.unrealizedPnlBrl)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Portfólio</dt>
                        <dd className="mt-0.5 font-medium tabular-nums">
                          {formatSignedPercent(asset.portfolioSharePercent).replace("+", "")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Variação 24h</dt>
                        <dd
                          className={cn(
                            "mt-0.5 font-medium tabular-nums",
                            amountToneClass(asset.change24hPercent)
                          )}
                        >
                          {asset.change24hPercent == null
                            ? "—"
                            : formatSignedPercent(asset.change24hPercent)}
                        </dd>
                      </div>
                    </dl>
                    {asset.costBasisMissing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAsset({ asset: asset.asset, currentCost: asset.averagePriceBrl || 0 })
                          setNewCost(asset.averagePriceBrl?.toString() || "")
                        }}
                        className="mt-3 text-xs text-amber-600 underline-offset-4 hover:underline dark:text-amber-400"
                      >
                        Definir custo para reconciliar esta posição
                      </button>
                    ) : null}
                  </article>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto md:block [&_table]:min-w-[1080px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="text-right">Preço atual</TableHead>
                  <TableHead className="text-right">Valor ({currency})</TableHead>
                  <TableHead className="text-right">Custo apurado</TableHead>
                  <TableHead className="text-right">PnL não realizado</TableHead>
                  <TableHead className="text-right">% do portfólio</TableHead>
                  <TableHead className="text-right">PnL Realizado</TableHead>
                  <TableHead className="text-right">Variação 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((asset) => {
                  const costBasisBrl = getCostBasisBrl(asset)
                  return (
                  <TableRow key={asset.asset}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarImage src={asset.imageUrl || undefined} />
                          <AvatarFallback className="text-xs bg-muted">
                            {asset.asset.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col gap-0.5">
                          <Link href={`/crypto/${asset.asset.toLowerCase()}`} className="font-medium hover:underline text-primary">
                            {asset.asset}
                          </Link>
                          {asset.costBasisMissing ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAsset({ asset: asset.asset, currentCost: asset.averagePriceBrl || 0 })
                              setNewCost(asset.averagePriceBrl?.toString() || "")
                            }}
                            className="w-fit text-xs text-amber-600 underline-offset-4 hover:underline dark:text-amber-400"
                          >
                            definir custo
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {asset.tradeCount} {asset.tradeCount === 1 ? "trade" : "trades"}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatQuantity(asset.quantity)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {asset.costBasisMissing || asset.averagePriceBrl == null
                        ? "—"
                        : format(asset.averagePriceBrl)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {asset.currentPriceBrl == null
                        ? "—"
                        : format(asset.currentPriceBrl)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {asset.valueBrl == null ? "—" : format(asset.valueBrl)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {costBasisBrl == null ? "—" : format(costBasisBrl)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        amountToneClass(asset.unrealizedPnlBrl)
                      )}
                    >
                      {asset.unrealizedPnlBrl == null ? "—" : format(asset.unrealizedPnlBrl)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {asset.valueBrl == null
                        ? "—"
                        : formatSignedPercent(asset.portfolioSharePercent).replace("+", "")}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        amountToneClass(asset.realizedPnlBrl)
                      )}
                    >
                      {asset.realizedPnlBrl == null ? "—" : format(asset.realizedPnlBrl)}
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
                  )
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </section>
      <Dialog open={!!editingAsset} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Ajustar preço médio — {editingAsset?.asset}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="cost" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Preço médio de aquisição (em BRL)
              </label>
              <Input
                id="cost"
                type="number"
                step="0.00000001"
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                placeholder="Ex: 50000.00"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Informe o valor médio pago por cada unidade do ativo para que o PnL seja calculado corretamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAsset(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCost} disabled={isSaving || !newCost}>
              {isSaving ? "Salvando..." : "Salvar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
