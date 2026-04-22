"use client"

import { useState, useMemo, Suspense } from "react"
import Link from "next/link"
import { Search, Store, Users, DollarSign } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { usePeriod } from "@/hooks/use-period"
import { useCurrency } from "@/lib/currency-context"
import { PageHeader } from "@/components/page-header"
import { PeriodSwitcher } from "@/components/period-switcher"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table"

interface MerchantSpending {
  merchant: string
  merchantId: string
  total: number
  percentage: number
  transactionCount: number
}

interface SpendingResponse {
  summary: { total: number }
  results: MerchantSpending[]
}

interface Merchant {
  id: string
  displayName: string
  normalizedName: string
  cnpj: string | null
}

interface MerchantsResponse {
  summary: { total: number }
  results: Merchant[]
}

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return "-"

  const digits = cnpj.replace(/\D/g, "")

  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
  }

  if (digits.length >= 6) {
    return `${digits.slice(0, 6)}***`
  }

  return cnpj
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card size="sm" key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-20" />
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

export default function MerchantsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <MerchantsContent />
    </Suspense>
  )
}

function MerchantsContent() {
  const { format } = useCurrency()
  const [searchQuery, setSearchQuery] = useState("")
  const period = usePeriod("mtd")

  const { data: spendingData, loading: spendingLoading } =
    useApi<SpendingResponse>("/api/domain/metrics/spending/merchants", period.params)

  const { data: merchantsData, loading: merchantsLoading } =
    useApi<MerchantsResponse>("/api/domain/merchants", { pageSize: "500" })

  const loading = spendingLoading || merchantsLoading

  const merchantsMap = useMemo(() => {
    const map = new Map<string, Merchant>()
    if (merchantsData?.results) {
      for (const m of merchantsData.results) {
        map.set(m.id, m)
      }
    }
    return map
  }, [merchantsData])

  const enrichedMerchants = useMemo(() => {
    if (!spendingData?.results) return []

    return spendingData.results.map((item) => {
      const merchantDetails = merchantsMap.get(item.merchantId)
      return {
        ...item,
        cnpj: merchantDetails?.cnpj ?? null,
        displayName: merchantDetails?.displayName ?? item.merchant,
      }
    })
  }, [spendingData, merchantsMap])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return enrichedMerchants

    const q = searchQuery.toLowerCase().trim()
    return enrichedMerchants.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.merchant.toLowerCase().includes(q) ||
        (m.cnpj && m.cnpj.includes(q))
    )
  }, [enrichedMerchants, searchQuery])

  const totalSpent = spendingData?.summary?.total ?? 0
  const totalMerchants = enrichedMerchants.length
  const totalTransactions = enrichedMerchants.reduce(
    (sum, m) => sum + m.transactionCount,
    0
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Comerciantes"
        title="Comerciantes e gastos"
        description="Veja os estabelecimentos que mais concentram despesas e abra o drill-down já filtrado."
        actions={<PeriodSwitcher state={period} />}
      />

      {/* Summary */}
      {loading ? (
        <SummarySkeleton />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <Users className="size-4 text-muted-foreground" />
                <CardDescription>Total de Comerciantes</CardDescription>
              </div>
              <CardTitle>{totalMerchants}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <DollarSign className="size-4 text-destructive" />
                <CardDescription>Total Gasto</CardDescription>
              </div>
              <CardTitle className="text-destructive">
                {format(totalSpent)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <Store className="size-4 text-muted-foreground" />
                <CardDescription>Total de Transacoes</CardDescription>
              </div>
              <CardTitle>{totalTransactions}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar comerciante..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Merchants Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Store className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                Nenhum comerciante encontrado
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Tente ajustar a busca."
                  : "Nenhum comerciante registrado ainda."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comerciante</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-center">Transacoes</TableHead>
                  <TableHead className="text-right">Total Gasto</TableHead>
                  <TableHead className="text-right">% do Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((merchant) => (
                  <TableRow key={merchant.merchantId} className="cursor-pointer">
                    <TableCell>
                      <Link
                        href={`/transactions?merchantId=${encodeURIComponent(merchant.merchantId)}`}
                        className="font-medium hover:underline"
                      >
                        {merchant.displayName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      {formatCnpj(merchant.cnpj)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {merchant.transactionCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {format(merchant.total)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(Number.isFinite(merchant.percentage) ? merchant.percentage : 0).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
