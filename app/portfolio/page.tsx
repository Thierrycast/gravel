"use client"

import { useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { TrendingUp, TrendingDown } from "lucide-react"
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
  type ChartConfig,
} from "@/components/ui/chart"

interface AssetItem {
  name: string
  type: string
  value: number
  percentage: number
}

interface PortfolioGroup {
  total: number
  items: AssetItem[]
}

interface HistoryPoint {
  date: string
  netWorth: number
  assets: number
  liabilities: number
}

interface PortfolioData {
  assets: PortfolioGroup
  liabilities: PortfolioGroup
  netWorth: number
  history: HistoryPoint[]
  recurring: {
    monthlyIncome: number
    monthlyExpenses: number
  }
}

const periods = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "YTD", value: "YTD" },
  { label: "1Y", value: "1Y" },
  { label: "ALL", value: "ALL" },
]

const chartConfig: ChartConfig = {
  netWorth: {
    label: "Patrimônio Líquido",
    color: "var(--chart-1)",
  },
}

const typeColors: Record<string, string> = {
  checking: "bg-blue-500",
  savings: "bg-emerald-500",
  investment: "bg-violet-500",
  crypto: "bg-amber-500",
  property: "bg-rose-500",
  credit: "bg-red-500",
  loan: "bg-orange-500",
  other: "bg-gray-500",
}

function getTypeColor(type: string): string {
  return typeColors[type.toLowerCase()] ?? typeColors.other
}

export default function PortfolioPage() {
  const [period, setPeriod] = useState("YTD")
  const [activeTab, setActiveTab] = useState<"assets" | "liabilities">("assets")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const { data, loading } = useApi<PortfolioData>("/api/portfolio", {
    period,
  })

  const filteredHistory = (() => {
    if (!data?.history) return []
    const now = new Date()
    let cutoff: Date

    switch (period) {
      case "1M":
        cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        break
      case "3M":
        cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        break
      case "YTD":
        cutoff = new Date(now.getFullYear(), 0, 1)
        break
      case "1Y":
        cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        break
      default:
        return data.history
    }

    return data.history.filter((h) => new Date(h.date) >= cutoff)
  })()

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const currentGroup =
    activeTab === "assets" ? data?.assets : data?.liabilities

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Patrimônio</h1>
        <p className="text-muted-foreground">
          Visão geral de ativos, dívidas e patrimônio líquido
        </p>
      </div>

      {/* Top Cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Net Worth Card */}
        <Card>
          <CardHeader>
            <CardDescription>Patrimônio Líquido</CardDescription>
            <CardTitle
              className={`text-3xl ${
                (data?.netWorth ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {formatCurrency(data?.netWorth ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-600" />
                  <span className="text-sm text-muted-foreground">Ativos</span>
                </div>
                <span className="text-sm font-medium text-emerald-600">
                  {formatCurrency(data?.assets.total ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="size-4 text-red-500" />
                  <span className="text-sm text-muted-foreground">Dívidas</span>
                </div>
                <span className="text-sm font-medium text-red-500">
                  {formatCurrency(data?.liabilities.total ?? 0)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Receita mensal: {formatCurrency(data?.recurring.monthlyIncome ?? 0)}</span>
                <span>Despesa mensal: {formatCurrency(data?.recurring.monthlyExpenses ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* History Chart Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Histórico</CardTitle>
              <div className="flex items-center gap-1">
                {periods.map((p) => (
                  <Button
                    key={p.value}
                    variant={period === p.value ? "default" : "outline"}
                    size="xs"
                    onClick={() => setPeriod(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-40 w-full">
              <AreaChart data={filteredHistory} accessibilityLayer>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="var(--color-netWorth)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-netWorth)"
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return `${d.getDate()}/${d.getMonth() + 1}`
                  }}
                />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span>{formatCurrency(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="netWorth"
                  type="monotone"
                  fill="url(#netWorthGrad)"
                  stroke="var(--color-netWorth)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Ativos / Dividas */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "assets" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("assets")}
            >
              Ativos
            </Button>
            <Button
              variant={activeTab === "liabilities" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("liabilities")}
            >
              Dívidas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Allocation bar */}
          {currentGroup && currentGroup.items.length > 0 && (
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {currentGroup.items.map((item) => (
                <div
                  key={item.name}
                  className={`${getTypeColor(item.type)} transition-all`}
                  style={{ width: `${item.percentage}%` }}
                  title={`${item.name}: ${formatPercent(item.percentage)}`}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          {currentGroup && currentGroup.items.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {currentGroup.items.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div
                    className={`size-2.5 rounded-full ${getTypeColor(item.type)}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Peso (%)</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!currentGroup || currentGroup.items.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              )}
              {currentGroup?.items.map((item) => (
                <TableRow
                  key={item.name}
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedRow(
                      expandedRow === item.name ? null : item.name
                    )
                  }
                >
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(item.percentage)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      activeTab === "liabilities" ? "text-red-500" : ""
                    }`}
                  >
                    {formatCurrency(item.value)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Total */}
          {currentGroup && currentGroup.items.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-semibold">Total</span>
                <span
                  className={`text-sm font-semibold ${
                    activeTab === "liabilities"
                      ? "text-red-500"
                      : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(currentGroup.total)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
