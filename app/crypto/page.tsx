"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell } from "recharts"
import { Bitcoin, TrendingUp, TrendingDown, Wallet, BarChart3 } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatPercent } from "@/lib/format"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
  type ChartConfig,
} from "@/components/ui/chart"

interface CryptoAsset {
  symbol: string
  amount: number
  lastPrice: number
  quoteAsset: string
  currentValue: number
  avgPrice: number
  pnlUnrealized: number
  pnlRealized: number
  tradeCount: number
  firstTradeAt: string
  lastTradeAt: string
}

interface CryptoAllocation {
  asset: string
  value: number
  percentage: number
}

interface CryptoOverview {
  summary: {
    totalValue: number
    totalInvested: number
    totalPnl: number
    pnlPercentage: number
    assetCount: number
    allocations: CryptoAllocation[]
    bestPerformer: string
    worstPerformer: string
  }
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#8b5cf6",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
]

export default function CryptoPage() {
  const { data: assets, loading: assetsLoading } = useApi<CryptoAsset[]>(
    "/api/crypto"
  )
  const { data: overview, loading: overviewLoading } =
    useApi<CryptoOverview>("/api/domain/metrics/crypto/overview")

  const loading = assetsLoading || overviewLoading
  const summary = overview?.summary

  const chartConfig = useMemo<ChartConfig>(() => {
    if (!summary?.allocations) return {}
    const config: ChartConfig = {}
    summary.allocations.forEach((a, idx) => {
      config[a.asset] = {
        label: a.asset,
        color: PIE_COLORS[idx % PIE_COLORS.length],
      }
    })
    return config
  }, [summary])

  const pieData = useMemo(() => {
    if (!summary?.allocations) return []
    return summary.allocations.map((a) => ({
      name: a.asset,
      value: a.value,
      percentage: a.percentage,
    }))
  }, [summary])

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const pnlColor =
    (summary?.totalPnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"
  const pnlPctColor =
    (summary?.pnlPercentage ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Crypto</h1>
        <p className="text-muted-foreground">
          Resumo e performance dos seus criptoativos
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Valor Total
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(summary?.totalValue ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <BarChart3 className="size-3.5" />
              Total Investido
            </CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(summary?.totalInvested ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              {(summary?.totalPnl ?? 0) >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              P&L Total
            </CardDescription>
            <CardTitle className={`text-2xl ${pnlColor}`}>
              {formatCurrency(summary?.totalPnl ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              {(summary?.pnlPercentage ?? 0) >= 0 ? (
                <TrendingUp className="size-3.5" />
              ) : (
                <TrendingDown className="size-3.5" />
              )}
              P&L %
            </CardDescription>
            <CardTitle className={`text-2xl ${pnlPctColor}`}>
              {formatPercent(summary?.pnlPercentage ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Allocation Pie + Performers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Alocação</CardTitle>
            <CardDescription>
              Distribuição do portfólio por ativo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="mx-auto h-64 w-full">
              <PieChart accessibilityLayer>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>
                          {name}: {formatCurrency(Number(value))}
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {pieData.map((entry, idx) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              {pieData.map((entry, idx) => (
                <div key={entry.name} className="flex items-center gap-1.5">
                  <div
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor: PIE_COLORS[idx % PIE_COLORS.length],
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {entry.name} ({formatPercent(entry.percentage)})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Destaques</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Melhor Performance
              </span>
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600" />
                <span className="text-sm font-semibold">
                  {summary?.bestPerformer ?? "-"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Pior Performance
              </span>
              <div className="flex items-center gap-2">
                <TrendingDown className="size-4 text-red-500" />
                <span className="text-sm font-semibold">
                  {summary?.worstPerformer ?? "-"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Total de Ativos
              </span>
              <span className="text-sm font-semibold">
                {summary?.assetCount ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ativos</CardTitle>
          <CardDescription>
            Detalhamento de cada criptoativo no portfólio
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço Atual</TableHead>
                <TableHead className="text-right">Preço Médio</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">P&L Não Realizado</TableHead>
                <TableHead className="text-right">P&L Realizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!assets || assets.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    Nenhum ativo encontrado.
                  </TableCell>
                </TableRow>
              )}
              {assets?.map((asset) => {
                const unrealizedColor =
                  asset.pnlUnrealized >= 0
                    ? "text-emerald-600"
                    : "text-red-500"
                const realizedColor =
                  asset.pnlRealized >= 0
                    ? "text-emerald-600"
                    : "text-red-500"

                return (
                  <TableRow key={asset.symbol}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">
                          {asset.symbol}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {asset.quoteAsset}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {asset.amount.toLocaleString("pt-BR", {
                        maximumFractionDigits: 6,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(asset.lastPrice)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(asset.avgPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(asset.currentValue)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${unrealizedColor}`}>
                      {formatCurrency(asset.pnlUnrealized)}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${realizedColor}`}>
                      {formatCurrency(asset.pnlRealized)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
