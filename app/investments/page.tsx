"use client"

import { useMemo } from "react"
import { Landmark, TrendingUp, BarChart3, Layers } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useCurrency } from "@/lib/currency-context"
import { PageError } from "@/components/page-error"
import { cn } from "@/lib/utils"
import { amountToneClass, formatCurrencyByCode } from "@/lib/format"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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

interface Investment {
  id: string
  name: string
  type: string | null
  subtype: string | null
  balance: string | number | null
  currencyCode: string | null
  status: string | null
  metadataJson: string | null
}

interface InvestmentsResponse {
  results: Investment[]
  summary: {
    total: number
    byCurrency?: Record<string, { count: number; balance: number }>
  }
}

const TYPE_LABELS: Record<string, string> = {
  FIXED_INCOME: "Renda Fixa",
  MUTUAL_FUND: "Fundos",
  SECURITY: "Renda Variável",
  EQUITY: "Renda Variável",
  COE: "COE",
  ETF: "ETF",
  OTHER: "Outros",
}

const INACTIVE_INVESTMENT_STATUSES = new Set([
  "CANCELLED",
  "CLOSED",
  "REDEEMED",
  "SOLD",
  "TOTAL_WITHDRAWAL",
  "WITHDRAWN",
])

function getTypeLabel(type: string | null): string {
  if (!type) return "Outros"
  return TYPE_LABELS[type] ?? type
}

function getGroupLabel(type: string | null): string {
  return getTypeLabel(type)
}

function getStatusVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (!status) return "secondary"
  const s = status.toUpperCase()
  if (s === "ACTIVE" || s === "ATIVO") return "default"
  if (s === "INACTIVE" || s === "INATIVO") return "secondary"
  if (s === "TOTAL_WITHDRAWAL") return "destructive"
  if (s === "PARTIAL_WITHDRAWAL") return "outline"
  if (s === "MATURE" || s === "MATURED") return "secondary"
  if (s === "CANCELLED") return "destructive"
  return "outline"
}

function getStatusLabel(status: string | null): string {
  if (!status) return "N/A"
  const s = status.toUpperCase()
  if (s === "ACTIVE" || s === "ATIVO") return "Ativo"
  if (s === "INACTIVE" || s === "INATIVO") return "Inativo"
  if (s === "TOTAL_WITHDRAWAL") return "Retirada Total"
  if (s === "PARTIAL_WITHDRAWAL") return "Retirada Parcial"
  if (s === "MATURE" || s === "MATURED") return "Vencido"
  if (s === "CANCELLED") return "Cancelado"
  return status
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === "string" ? parseFloat(value) || 0 : value
}

function isActiveInvestmentPosition(investment: Investment): boolean {
  const status = investment.status?.trim().toUpperCase()
  return (
    Math.abs(toNumber(investment.balance)) > 0 &&
    !INACTIVE_INVESTMENT_STATUSES.has(status ?? "")
  )
}

function currencyCodeOf(value?: string | null) {
  const code = value?.trim().toUpperCase()
  if (!code || code === "R$" || code === "REAL" || code === "REAIS") return "BRL"
  if (code === "DOLAR" || code === "DOLLAR") return "USD"
  return code
}

function displayMoney(
  value: string | number | null | undefined,
  currencyCode: string | null | undefined,
  isPrivate: boolean
) {
  if (isPrivate) return "••••"
  return formatCurrencyByCode(toNumber(value), currencyCodeOf(currencyCode))
}

function parseInvestmentMetadata(investment: Investment) {
  try {
    return JSON.parse(investment.metadataJson || "{}") as {
      amountOriginal?: number | string | null
      amountProfit?: number | string | null
    }
  } catch {
    return {}
  }
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export default function InvestmentsPage() {
  const { isPrivate } = useCurrency()
  const { data, loading, error, refetch } = useApi<InvestmentsResponse>("/api/domain/investments")

  const investments = useMemo(() => data?.results ?? [], [data])

  const { byCurrency, activePositionCount, byType } = useMemo(() => {
    const currencyMap = new Map<string, { count: number; balance: number }>()
    const typeMap = new Map<string, { count: number }>()
    const activeInvestments = investments.filter(isActiveInvestmentPosition)

    for (const inv of activeInvestments) {
      const currencyCode = currencyCodeOf(inv.currencyCode)
      const bal = toNumber(inv.balance)
      const currency = currencyMap.get(currencyCode) ?? { count: 0, balance: 0 }
      currency.count += 1
      currency.balance += bal
      currencyMap.set(currencyCode, currency)

      const group = getGroupLabel(inv.type)
      const existing = typeMap.get(group) ?? { count: 0 }
      existing.count += 1
      typeMap.set(group, existing)
    }

    const byCurrencyArr = Array.from(currencyMap.entries())
      .map(([currencyCode, summary]) => ({ currencyCode, ...summary }))
      .sort((a, b) => {
        if (a.currencyCode === "BRL") return -1
        if (b.currencyCode === "BRL") return 1
        return b.balance - a.balance
      })
    const byTypeArr = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.count - a.count)

    return {
      byCurrency: byCurrencyArr,
      activePositionCount: activeInvestments.length,
      byType: byTypeArr,
    }
  }, [investments])

  const groupedInvestments = useMemo(() => {
    const groups = new Map<string, Investment[]>()
    for (const inv of investments) {
      const group = `${getGroupLabel(inv.type)}:${currencyCodeOf(inv.currencyCode)}`
      const list = groups.get(group) ?? []
      list.push(inv)
      groups.set(group, list)
    }
    // Sort groups by total balance desc
    return Array.from(groups.entries())
      .map(([groupKey, items]) => ({
        group: groupKey.split(":")[0],
        currencyCode: groupKey.split(":")[1] ?? "BRL",
        items: items.sort((a, b) => toNumber(b.balance) - toNumber(a.balance)),
        total: items.reduce((sum, i) => sum + toNumber(i.balance), 0),
      }))
      .sort((a, b) => {
        if (a.currencyCode === "BRL" && b.currencyCode !== "BRL") return -1
        if (b.currencyCode === "BRL" && a.currencyCode !== "BRL") return 1
        return b.total - a.total
      })
  }, [investments])

  if (error) {
    return <PageError message="Erro ao carregar investimentos" refetch={refetch} />
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Investimentos</h1>
        <p className="text-muted-foreground">
          Visão geral dos seus investimentos e posições
        </p>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <SummarySkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <TrendingUp className="size-3.5" />
                Total ativo por moeda
              </CardDescription>
              <CardTitle className="space-y-1 text-base">
                {byCurrency.length === 0 ? (
                  "—"
                ) : (
                  byCurrency.map((item) => (
                    <div
                      key={item.currencyCode}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {item.currencyCode}
                      </span>
                      <span className="tabular-nums">
                        {displayMoney(item.balance, item.currencyCode, isPrivate)}
                      </span>
                    </div>
                  ))
                )}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                Posições ativas
              </CardDescription>
              <CardTitle className="text-2xl">{activePositionCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <BarChart3 className="size-3.5" />
                Ativas por tipo
              </CardDescription>
              <CardTitle className="text-sm font-normal">
                <div className="flex flex-wrap gap-2 mt-1">
                  {byType.length === 0
                    ? "—"
                    : byType.map((t) => (
                        <Badge key={t.type} variant="secondary">
                          {t.type}: {t.count}
                        </Badge>
                      ))}
                </div>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!loading && investments.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Landmark className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhum investimento encontrado
            </h3>
            <p className="text-sm text-muted-foreground">
              Seus investimentos aparecerão aqui após a sincronização com suas
              contas.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading Table */}
      {loading && <TableSkeleton />}

      {/* Grouped Investment Tables */}
      {!loading &&
        groupedInvestments.map(({ group, currencyCode, items, total }) => (
          <Card key={`${group}:${currencyCode}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {group}
                  <Badge variant="outline">{currencyCode}</Badge>
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
                <span className="text-sm font-semibold">
                  {displayMoney(total, currencyCode, isPrivate)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Subtipo</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Lucro/Prejuízo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium max-w-[140px] sm:max-w-[300px] truncate">
                        {inv.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getTypeLabel(inv.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {inv.subtype ?? "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {(() => {
                          const meta = parseInvestmentMetadata(inv)
                          return meta.amountOriginal
                            ? displayMoney(meta.amountOriginal, inv.currencyCode, isPrivate)
                            : "—"
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {displayMoney(inv.balance, inv.currencyCode, isPrivate)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        (() => {
                          const meta = parseInvestmentMetadata(inv)
                          return amountToneClass(toNumber(meta.amountProfit))
                        })()
                      )}>
                        {(() => {
                          const meta = parseInvestmentMetadata(inv)
                          return meta.amountProfit
                            ? displayMoney(meta.amountProfit, inv.currencyCode, isPrivate)
                            : "—"
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(inv.status)}>
                          {getStatusLabel(inv.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}
