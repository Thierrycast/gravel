"use client"

import { useMemo } from "react"
import { Landmark, TrendingUp, BarChart3, Layers } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/format"
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
}

interface InvestmentsResponse {
  results: Investment[]
  summary: {
    total: number
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
  const { data, loading } = useApi<InvestmentsResponse>(
    "/api/domain/investments"
  )

  const investments = data?.results ?? []

  const { totalBalance, positionCount, byType } = useMemo(() => {
    let total = 0
    const typeMap = new Map<string, { count: number; balance: number }>()

    for (const inv of investments) {
      const bal = toNumber(inv.balance)
      total += bal

      const group = getGroupLabel(inv.type)
      const existing = typeMap.get(group) ?? { count: 0, balance: 0 }
      existing.count += 1
      existing.balance += bal
      typeMap.set(group, existing)
    }

    const byTypeArr = Array.from(typeMap.entries())
      .map(([type, data]) => ({ type, ...data }))
      .sort((a, b) => b.balance - a.balance)

    return {
      totalBalance: total,
      positionCount: investments.length,
      byType: byTypeArr,
    }
  }, [investments])

  const groupedInvestments = useMemo(() => {
    const groups = new Map<string, Investment[]>()
    for (const inv of investments) {
      const group = getGroupLabel(inv.type)
      const list = groups.get(group) ?? []
      list.push(inv)
      groups.set(group, list)
    }
    // Sort groups by total balance desc
    return Array.from(groups.entries())
      .map(([group, items]) => ({
        group,
        items: items.sort((a, b) => toNumber(b.balance) - toNumber(a.balance)),
        total: items.reduce((sum, i) => sum + toNumber(i.balance), 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [investments])

  return (
    <div className="flex flex-col gap-6 p-6">
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
                Total Investido
              </CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(totalBalance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                Posições
              </CardDescription>
              <CardTitle className="text-2xl">{positionCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <BarChart3 className="size-3.5" />
                Por Tipo
              </CardDescription>
              <CardTitle className="text-sm font-normal">
                <div className="flex flex-wrap gap-2 mt-1">
                  {byType.map((t) => (
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
        groupedInvestments.map(({ group, items, total }) => (
          <Card key={group}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {group}
                  <Badge variant="secondary">{items.length}</Badge>
                </CardTitle>
                <span className="text-sm font-semibold">
                  {formatCurrency(total)}
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
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium max-w-[300px] truncate">
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
                      <TableCell className="text-right font-medium">
                        {formatCurrency(toNumber(inv.balance))}
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
