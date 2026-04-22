"use client"

import {
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Search,
  X,
} from "lucide-react"

import { PageError } from "@/components/page-error"
import { PageHeader } from "@/components/page-header"
import { PeriodSwitcher } from "@/components/period-switcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useApi } from "@/hooks/use-api"
import { usePeriod } from "@/hooks/use-period"
import { getCategoryEmoji } from "@/lib/category-emoji"
import {
  amountToneClass,
  formatDate,
  formatDateFull,
  formatSignedCurrency,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  type AccountLookup,
  type CategoryLookup,
  type MerchantLookup,
  type LookupResponse,
  type Transaction,
  type TransactionsResponse,
} from "@/lib/types/api"

interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeDirection(value: string | null): "INFLOW" | "OUTFLOW" | undefined {
  const normalized = value?.trim().toUpperCase()
  if (normalized === "INFLOW" || normalized === "INCOME") return "INFLOW"
  if (normalized === "OUTFLOW" || normalized === "EXPENSE") return "OUTFLOW"
  return undefined
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Skeleton className="h-9 w-full max-w-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <Skeleton className="h-[520px] rounded-xl" />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2 px-4 py-4">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[110px_1.8fr_1.1fr_1.2fr_140px] gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="hidden md:block h-4 w-28" />
          <Skeleton className="hidden sm:block h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Receipt className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Nenhuma transação encontrada</p>
        <p className="text-sm text-muted-foreground">
          Ajuste os filtros ou remova algum chip para ampliar a busca.
        </p>
      </div>
    </div>
  )
}

function FilterPill({ chip }: { chip: FilterChip }) {
  return (
    <button
      type="button"
      onClick={chip.onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span>{chip.label}</span>
      <X className="size-3 text-muted-foreground" />
    </button>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TransactionsContent />
    </Suspense>
  )
}

function TransactionsContent() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const period = usePeriod("mtd")

  const categoryId = searchParams.get("categoryId") ?? undefined
  const merchantId = searchParams.get("merchantId") ?? undefined
  const accountId = searchParams.get("accountId") ?? undefined
  const legacyAccountName = searchParams.get("accountName") ?? undefined
  const direction = normalizeDirection(searchParams.get("direction"))
  const query = searchParams.get("q") ?? searchParams.get("search") ?? ""
  const page = parsePositiveInt(searchParams.get("page"), 1)
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 25)

  const [searchInput, setSearchInput] = useState(query)
  const deferredSearchInput = useDeferredValue(searchInput)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const categories = useApi<LookupResponse<CategoryLookup>>("/api/domain/categories", {
    pageSize: "500",
  })
  const accounts = useApi<LookupResponse<AccountLookup>>("/api/domain/accounts", {
    pageSize: "500",
  })
  const merchants = useApi<LookupResponse<MerchantLookup>>("/api/domain/merchants", {
    pageSize: "500",
  })

  const categoriesById = useMemo(() => {
    return new Map((categories.data?.results ?? []).map((category) => [category.id, category.name]))
  }, [categories.data?.results])

  const accountsById = useMemo(() => {
    return new Map((accounts.data?.results ?? []).map((account) => [account.id, account.name]))
  }, [accounts.data?.results])

  const merchantsById = useMemo(() => {
    return new Map(
      (merchants.data?.results ?? []).map((merchant) => [merchant.id, merchant.displayName])
    )
  }, [merchants.data?.results])

  const resolvedLegacyAccountId = useMemo(() => {
    if (accountId || !legacyAccountName) return accountId ?? null
    const match = (accounts.data?.results ?? []).find(
      (currentAccount) => currentAccount.name === legacyAccountName
    )
    return match?.id ?? null
  }, [accountId, legacyAccountName, accounts.data?.results])

  const shouldWaitForLegacyAccount =
    Boolean(legacyAccountName) && !accountId && accounts.loading

  const effectiveAccountId =
    accountId ??
    (legacyAccountName
      ? resolvedLegacyAccountId ?? (accounts.loading ? undefined : "__missing__")
      : undefined)

  const transactionParams = {
    ...period.params,
    page: String(page),
    pageSize: String(pageSize),
    ...(categoryId ? { categoryId } : {}),
    ...(merchantId ? { merchantId } : {}),
    ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
    ...(direction ? { direction } : {}),
    ...(query.trim() ? { q: query.trim() } : {}),
  }

  const transactions = useApi<TransactionsResponse>(
    shouldWaitForLegacyAccount ? null : "/api/domain/transactions",
    transactionParams
  )

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  useEffect(() => {
    const nextQuery = deferredSearchInput.trim()
    if (nextQuery === query.trim()) return

    const next = new URLSearchParams(searchParams.toString())
    if (nextQuery) {
      next.set("q", nextQuery)
    } else {
      next.delete("q")
    }
    next.delete("search")
    next.delete("page")

    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }, [deferredSearchInput, pathname, query, router, searchParams])

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString())
    let changed = false

    if (searchParams.has("search")) {
      const legacySearch = searchParams.get("search")?.trim()
      if (legacySearch && !searchParams.get("q")) {
        next.set("q", legacySearch)
      }
      next.delete("search")
      changed = true
    }

    if (legacyAccountName && !accountId && resolvedLegacyAccountId) {
      next.set("accountId", resolvedLegacyAccountId)
      next.delete("accountName")
      changed = true
    }

    if (!changed) return

    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }, [
    accountId,
    legacyAccountName,
    pathname,
    resolvedLegacyAccountId,
    router,
    searchParams,
  ])

  function replaceParams(mutator: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString())
    mutator(next)
    const qs = next.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  function removeFilter(key: string) {
    replaceParams((next) => {
      next.delete(key)
      next.delete("page")
    })
  }

  function setDirection(nextDirection?: "INFLOW" | "OUTFLOW") {
    replaceParams((next) => {
      if (nextDirection) {
        next.set("direction", nextDirection)
      } else {
        next.delete("direction")
      }
      next.delete("page")
    })
  }

  function setPage(nextPage: number) {
    replaceParams((next) => {
      if (nextPage <= 1) {
        next.delete("page")
      } else {
        next.set("page", String(nextPage))
      }
    })
  }

  function setPageSize(nextPageSize: number) {
    replaceParams((next) => {
      if (nextPageSize === 25) {
        next.delete("pageSize")
      } else {
        next.set("pageSize", String(nextPageSize))
      }
      next.delete("page")
    })
  }

  function clearAllFilters() {
    startTransition(() => {
      router.replace(pathname, { scroll: false })
    })
  }

  function openTransaction(transaction: Transaction) {
    setSelectedTransaction(transaction)
    setSheetOpen(true)
  }

  if (transactions.error) {
    return (
      <PageError
        message={transactions.error}
        refetch={transactions.refetch}
      />
    )
  }

  const total = transactions.data?.summary.total ?? 0
  const results = transactions.data?.results ?? []
  const totalPages = transactions.data?.meta.totalPages ?? 1
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total)
  const hasExplicitPeriod =
    searchParams.has("period") || searchParams.has("from") || searchParams.has("to")

  const activeFilters: FilterChip[] = [
    ...(hasExplicitPeriod
      ? [
          {
            key: "period",
            label: `Período: ${period.label}`,
            onRemove: () => {
              replaceParams((next) => {
                next.delete("period")
                next.delete("from")
                next.delete("to")
                next.delete("page")
              })
            },
          },
        ]
      : []),
    ...(categoryId
      ? [
          {
            key: "category",
            label: `Categoria: ${categoriesById.get(categoryId) ?? "Categoria"}`,
            onRemove: () => removeFilter("categoryId"),
          },
        ]
      : []),
    ...(merchantId
      ? [
          {
            key: "merchant",
            label: `Comerciante: ${merchantsById.get(merchantId) ?? "Comerciante"}`,
            onRemove: () => removeFilter("merchantId"),
          },
        ]
      : []),
    ...((effectiveAccountId && effectiveAccountId !== "__missing__") || legacyAccountName
      ? [
          {
            key: "account",
            label: `Conta: ${
              (effectiveAccountId && effectiveAccountId !== "__missing__"
                ? accountsById.get(effectiveAccountId)
                : null) ??
              legacyAccountName ??
              "Conta"
            }`,
            onRemove: () => {
              replaceParams((next) => {
                next.delete("accountId")
                next.delete("accountName")
                next.delete("page")
              })
            },
          },
        ]
      : []),
    ...(direction
      ? [
          {
            key: "direction",
            label: direction === "INFLOW" ? "Direção: entradas" : "Direção: saídas",
            onRemove: () => removeFilter("direction"),
          },
        ]
      : []),
    ...(query.trim()
      ? [
          {
            key: "query",
            label: `Busca: ${query.trim()}`,
            onRemove: () => {
              setSearchInput("")
              replaceParams((next) => {
                next.delete("q")
                next.delete("search")
                next.delete("page")
              })
            },
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Transações"
        title="Todas as movimentações"
        description={
          transactions.loading
            ? "Carregando transações do período."
            : total === 1
              ? "1 transação encontrada para os filtros atuais."
              : `${total} transações encontradas para os filtros atuais.`
        }
        actions={<PeriodSwitcher state={period} />}
      />

      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por descrição, comerciante, conta ou categoria"
            className="h-9 pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={direction == null ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDirection(undefined)}
          >
            Todas
          </Button>
          <Button
            variant={direction === "OUTFLOW" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDirection("OUTFLOW")}
          >
            Saídas
          </Button>
          <Button
            variant={direction === "INFLOW" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setDirection("INFLOW")}
          >
            Entradas
          </Button>
        </div>
      </section>

      {activeFilters.length > 0 ? (
        <section className="flex flex-wrap items-center gap-2">
          {activeFilters.map((chip) => (
            <FilterPill key={chip.key} chip={chip} />
          ))}
          <Button variant="ghost" size="xs" onClick={clearAllFilters}>
            Limpar tudo
          </Button>
        </section>
      ) : null}

      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-eyebrow">Lista densa</p>
            <h2 className="text-sm font-semibold tracking-tight">
              Drill-down detalhado do período
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {transactions.loading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span>
                Mostrando {showingFrom}-{showingTo} de {total}
              </span>
            )}
            <Separator orientation="vertical" className="hidden sm:block h-4" />
            <div className="flex items-center gap-1">
              <span>Por página</span>
              {[25, 50, 100].map((size) => (
                <Button
                  key={size}
                  variant={pageSize === size ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setPageSize(size)}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {transactions.loading ? (
          <TableSkeleton />
        ) : total === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="hidden md:table-cell">Conta</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((transaction) => {
                  const signedAmount =
                    transaction.direction === "INFLOW"
                      ? Math.abs(transaction.amount)
                      : -Math.abs(transaction.amount)

                  return (
                    <TableRow
                      key={transaction.id}
                      className="cursor-pointer"
                      onClick={() => openTransaction(transaction)}
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(transaction.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div
                            className={cn(
                              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                              transaction.direction === "INFLOW"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-rose-500/10 text-rose-500"
                            )}
                          >
                            {transaction.direction === "INFLOW" ? (
                              <ArrowUpRight className="size-3.5" />
                            ) : (
                              <ArrowDownLeft className="size-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {transaction.description}
                            </p>
                            {transaction.merchantName &&
                            transaction.merchantName !== transaction.description ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {transaction.merchantName}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {transaction.accountName || "Sem conta"}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="gap-1 rounded-full">
                          <span aria-hidden>{getCategoryEmoji(transaction.categoryName)}</span>
                          <span className="max-w-[160px] truncate">
                            {transaction.categoryName}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          amountToneClass(signedAmount)
                        )}
                      >
                        {formatSignedCurrency(signedAmount, "always")}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {!transactions.loading && total > 0 ? (
        <section className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </section>
      ) : null}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedTransaction?.description}</SheetTitle>
            <SheetDescription>Detalhes da transação selecionada.</SheetDescription>
          </SheetHeader>

          {selectedTransaction ? (
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div
                className={cn(
                  "text-center text-2xl font-semibold tabular-nums",
                  amountToneClass(
                    selectedTransaction.direction === "INFLOW"
                      ? Math.abs(selectedTransaction.amount)
                      : -Math.abs(selectedTransaction.amount)
                  )
                )}
              >
                {formatSignedCurrency(
                  selectedTransaction.direction === "INFLOW"
                    ? Math.abs(selectedTransaction.amount)
                    : -Math.abs(selectedTransaction.amount),
                  "always"
                )}
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Descrição</span>
                  <span className="max-w-[60%] text-right font-medium">
                    {selectedTransaction.description}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Data</span>
                  <span>{formatDateFull(selectedTransaction.date)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Conta</span>
                  <span className="text-right">
                    {selectedTransaction.accountName || "Sem conta"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Categoria</span>
                  <span className="text-right">
                    {getCategoryEmoji(selectedTransaction.categoryName)}{" "}
                    {selectedTransaction.categoryName}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Direção</span>
                  <span>
                    {selectedTransaction.direction === "INFLOW" ? "Entrada" : "Saída"}
                  </span>
                </div>
                {selectedTransaction.merchantName ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Comerciante</span>
                    <span className="max-w-[60%] text-right">
                      {selectedTransaction.merchantName}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
