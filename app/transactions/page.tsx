"use client"

import { useState, useMemo, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  TrendingDown,
  TrendingUp,
  Receipt,
} from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatDate, formatDateFull } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

interface Transaction {
  id: string
  description: string
  amount: number
  date: string
  type: string
  category: string
  categoryId: string
  accountName: string
  merchantName: string
}

interface TransactionsResponse {
  summary: { total: number }
  results: Transaction[]
  meta: { page: number; pageSize: number }
}

interface Category {
  id: string
  name: string
}

interface CategoriesResponse {
  results: Category[]
}

type PeriodFilter = "this_month" | "last_month" | "last_30" | "last_90"
type TypeFilter = "all" | "EXPENSE" | "INCOME"

const periodLabels: Record<PeriodFilter, string> = {
  this_month: "Este mês",
  last_month: "Mês passado",
  last_30: "Últimos 30 dias",
  last_90: "Últimos 3 meses",
}

const typeLabels: Record<TypeFilter, string> = {
  all: "Todos",
  EXPENSE: "Despesas",
  INCOME: "Receitas",
}

function getPeriodDates(period: PeriodFilter): { from: string; to: string } {
  const now = new Date()
  let from: Date
  let to: Date

  switch (period) {
    case "this_month":
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      break
    case "last_month":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      to = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case "last_30":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      to = now
      break
    case "last_90":
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      to = now
      break
  }

  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

function groupByDate(
  transactions: Transaction[]
): { date: string; transactions: Transaction[] }[] {
  const grouped = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const dateKey = t.date.split("T")[0]
    if (!grouped.has(dateKey)) grouped.set(dateKey, [])
    grouped.get(dateKey)!.push(t)
  }
  return Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, transactions]) => ({ date, transactions }))
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-6 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>}>
      <TransactionsContent />
    </Suspense>
  )
}

function TransactionsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [period, setPeriod] = useState<PeriodFilter>("this_month")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") ?? ""
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const accountNameFilter = searchParams.get("accountName") ?? ""

  const periodDates = useMemo(() => getPeriodDates(period), [period])

  const { data: txData, loading: txLoading } =
    useApi<TransactionsResponse>("/api/domain/transactions", {
      from: periodDates.from,
      to: periodDates.to,
      pageSize: "1000",
    })

  const { data: catData } =
    useApi<CategoriesResponse>("/api/domain/categories")

  const categories = catData?.results ?? []
  const allTransactions = txData?.results ?? []

  const filtered = useMemo(() => {
    let result = allTransactions

    if (typeFilter !== "all") {
      result = result.filter((t) => t.type === typeFilter)
    }

    if (categoryFilter !== "all") {
      result = result.filter((t) => t.categoryId === categoryFilter)
    }

    if (accountNameFilter) {
      result = result.filter((t) => t.accountName === accountNameFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.merchantName?.toLowerCase().includes(q) ||
          t.accountName?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
      )
    }

    return result
  }, [allTransactions, typeFilter, categoryFilter, accountNameFilter, searchQuery])

  const totalExpenses = useMemo(
    () =>
      filtered
        .filter((t) => t.type === "EXPENSE")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [filtered]
  )

  const totalIncome = useMemo(
    () =>
      filtered
        .filter((t) => t.type === "INCOME")
        .reduce((sum, t) => sum + t.amount, 0),
    [filtered]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedStart = (page - 1) * pageSize
  const paginated = filtered.slice(paginatedStart, paginatedStart + pageSize)
  const groupedTransactions = useMemo(() => groupByDate(paginated), [paginated])

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router]
  )

  function handleTransactionClick(transaction: Transaction) {
    setSelectedTransaction(transaction)
    setSheetOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transações</h1>
        <p className="text-muted-foreground">
          Histórico completo de movimentações
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter data-icon="inline-start" />
              {periodLabels[period]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Período</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.entries(periodLabels) as [PeriodFilter, string][]).map(
              ([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    setPeriod(key)
                    setPage(1)
                  }}
                >
                  {label}
                  {key === period && (
                    <Badge variant="secondary" className="ml-auto">
                      ativo
                    </Badge>
                  )}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Type Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ArrowUpDown data-icon="inline-start" />
              {typeLabels[typeFilter]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Tipo</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.entries(typeLabels) as [TypeFilter, string][]).map(
              ([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => {
                    setTypeFilter(key)
                    setPage(1)
                  }}
                >
                  {label}
                  {key === typeFilter && (
                    <Badge variant="secondary" className="ml-auto">
                      ativo
                    </Badge>
                  )}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Category Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter data-icon="inline-start" />
              {categoryFilter === "all"
                ? "Categoria"
                : categories.find((c) => c.id === categoryFilter)?.name ??
                  "Categoria"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Categoria</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setCategoryFilter("all")
                setPage(1)
              }}
            >
              Todas
              {categoryFilter === "all" && (
                <Badge variant="secondary" className="ml-auto">
                  ativo
                </Badge>
              )}
            </DropdownMenuItem>
            {categories.map((cat) => (
              <DropdownMenuItem
                key={cat.id}
                onClick={() => {
                  setCategoryFilter(cat.id)
                  setPage(1)
                }}
              >
                {cat.name}
                {cat.id === categoryFilter && (
                  <Badge variant="secondary" className="ml-auto">
                    ativo
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar transações..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
            className="pl-8"
          />
        </div>

        {/* Clear Filters */}
        {(typeFilter !== "all" ||
          categoryFilter !== "all" ||
          searchQuery ||
          accountNameFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter("all")
              setCategoryFilter("all")
              setSearchQuery("")
              setPage(1)
              router.replace("/transactions", { scroll: false })
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Account filter indicator */}
      {accountNameFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Conta: {accountNameFilter}
          </Badge>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              router.replace("/transactions", { scroll: false })
            }}
          >
            Remover
          </Button>
        </div>
      )}

      {/* Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total de Transações</CardDescription>
            <CardTitle>
              {txLoading ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                filtered.length
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="size-4 text-destructive" />
              <CardDescription>Despesas</CardDescription>
            </div>
            <CardTitle className="text-destructive">
              {txLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatCurrency(totalExpenses)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-4 text-emerald-600" />
              <CardDescription>Receitas</CardDescription>
            </div>
            <CardTitle className="text-emerald-600">
              {txLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatCurrency(totalIncome)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Resultado Líquido</CardDescription>
            <CardTitle
              className={
                totalIncome - totalExpenses >= 0
                  ? "text-emerald-600"
                  : "text-destructive"
              }
            >
              {txLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                formatCurrency(totalIncome - totalExpenses)
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Receipt className="size-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                Nenhuma transação encontrada
              </h3>
              <p className="text-sm text-muted-foreground">
                Tente ajustar os filtros ou o período selecionado.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedTransactions.map((group) => (
                  <>
                    <TableRow key={`date-${group.date}`}>
                      <TableCell
                        colSpan={5}
                        className="bg-muted/50 py-1.5 text-xs font-medium text-muted-foreground"
                      >
                        {formatDateFull(group.date)}
                      </TableCell>
                    </TableRow>
                    {group.transactions.map((tx) => (
                      <TableRow
                        key={tx.id}
                        className="cursor-pointer"
                        onClick={() => handleTransactionClick(tx)}
                      >
                        <TableCell>
                          <div className="font-medium">{tx.description}</div>
                          {tx.merchantName &&
                            tx.merchantName !== tx.description && (
                              <div className="text-xs text-muted-foreground">
                                {tx.merchantName}
                              </div>
                            )}
                        </TableCell>
                        <TableCell>
                          {tx.category && (
                            <Badge variant="secondary">{tx.category}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {tx.accountName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(tx.date)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            tx.type === "INCOME"
                              ? "text-emerald-600"
                              : "text-destructive"
                          }`}
                        >
                          {tx.type === "INCOME" ? "+" : "-"}
                          {formatCurrency(Math.abs(tx.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!txLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Mostrando {paginatedStart + 1}-
              {Math.min(paginatedStart + pageSize, filtered.length)} de{" "}
              {filtered.length}
            </span>
            <Separator orientation="vertical" className="h-4" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs">
                  {pageSize} por página
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {[10, 25, 50, 100].map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onClick={() => {
                      setPageSize(size)
                      setPage(1)
                    }}
                  >
                    {size} por página
                    {size === pageSize && (
                      <Badge variant="secondary" className="ml-auto">
                        ativo
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {/* Transaction Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedTransaction?.description}</SheetTitle>
            <SheetDescription>Detalhes da transação</SheetDescription>
          </SheetHeader>
          {selectedTransaction && (
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div
                className={`text-center text-2xl font-bold ${
                  selectedTransaction.type === "INCOME"
                    ? "text-emerald-600"
                    : "text-destructive"
                }`}
              >
                {selectedTransaction.type === "INCOME" ? "+" : "-"}
                {formatCurrency(Math.abs(selectedTransaction.amount))}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Descrição
                  </span>
                  <span className="text-sm font-medium text-right max-w-[60%]">
                    {selectedTransaction.description}
                  </span>
                </div>
                {selectedTransaction.merchantName && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Estabelecimento
                    </span>
                    <span className="text-sm">
                      {selectedTransaction.merchantName}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tipo</span>
                  <Badge
                    variant={
                      selectedTransaction.type === "INCOME"
                        ? "default"
                        : "destructive"
                    }
                  >
                    {selectedTransaction.type === "INCOME"
                      ? "Receita"
                      : "Despesa"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Categoria
                  </span>
                  <Badge variant="secondary">
                    {selectedTransaction.category || "Sem categoria"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Conta</span>
                  <span className="text-sm">
                    {selectedTransaction.accountName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Data</span>
                  <span className="text-sm">
                    {formatDateFull(selectedTransaction.date)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
