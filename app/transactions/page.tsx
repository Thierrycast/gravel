"use client";

import {
  Suspense,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  Receipt,
  Search,
  X,
} from "lucide-react";

import { PageError } from "@/components/page-error";
import { PageHeader } from "@/components/page-header";
import { LogoImage } from "@/components/logo-image";
import { PeriodSwitcher } from "@/components/period-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApi } from "@/hooks/use-api";
import { usePeriod } from "@/hooks/use-period";
import { getCategoryEmoji, getCategoryColor } from "@/lib/category-emoji";
import { amountToneClass, formatDate, formatDateFull } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { cn } from "@/lib/utils";

import {
  type AccountLookup,
  type CategoryLookup,
  type MerchantLookup,
  type LookupResponse,
  type Transaction,
  type TransactionsResponse,
} from "@/lib/types/api";

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDirection(
  value: string | null,
): "INFLOW" | "OUTFLOW" | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "INFLOW" || normalized === "INCOME") return "INFLOW";
  if (normalized === "OUTFLOW" || normalized === "EXPENSE") return "OUTFLOW";
  return undefined;
}

function installmentLabel(transaction: Transaction) {
  if (!transaction.installmentNumber || !transaction.installmentTotal) {
    return null;
  }
  return `${transaction.installmentNumber}/${transaction.installmentTotal}`;
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
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 px-4 py-4">
      {Array.from({ length: 10 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[110px_1.8fr_1.1fr_1.2fr_140px] gap-3"
        >
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="hidden md:block h-4 w-28" />
          <Skeleton className="hidden sm:block h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
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
  );
}

function FilterPill({ chip }: { chip: FilterChip }) {
  return (
    <button
      type="button"
      onClick={chip.onRemove}
      className="inline-flex items-center gap-1.5 border border-border bg-background px-2.5 py-1 text-xs font-mono text-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <span>{chip.label}</span>
      <X className="size-2.5 text-muted-foreground" />
    </button>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TransactionsContent />
    </Suspense>
  );
}

function TransactionsContent() {
  const { format, formatSigned } = useCurrency();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = usePeriod("mtd");

  const categoryId = searchParams.get("categoryId") ?? undefined;
  const merchantId = searchParams.get("merchantId") ?? undefined;
  const accountId = searchParams.get("accountId") ?? undefined;
  const legacyAccountName = searchParams.get("accountName") ?? undefined;
  const direction = normalizeDirection(searchParams.get("direction"));
  const query = searchParams.get("q") ?? searchParams.get("search") ?? "";
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 25);

  const [searchInput, setSearchInput] = useState(query);
  const deferredSearchInput = useDeferredValue(searchInput);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [draftMerchantName, setDraftMerchantName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const categories = useApi<LookupResponse<CategoryLookup>>(
    "/api/domain/categories",
    {
      pageSize: "500",
    },
  );
  const accounts = useApi<LookupResponse<AccountLookup>>(
    "/api/domain/accounts",
    {
      pageSize: "500",
    },
  );
  const merchants = useApi<LookupResponse<MerchantLookup>>(
    "/api/domain/merchants",
    {
      pageSize: "500",
    },
  );

  const categoriesById = useMemo(() => {
    return new Map(
      (categories.data?.results ?? []).map((category) => [
        category.id,
        category.name,
      ]),
    );
  }, [categories.data?.results]);

  const accountsById = useMemo(() => {
    return new Map(
      (accounts.data?.results ?? []).map((account) => [
        account.id,
        account.name,
      ]),
    );
  }, [accounts.data?.results]);

  const merchantsById = useMemo(() => {
    return new Map(
      (merchants.data?.results ?? []).map((merchant) => [
        merchant.id,
        merchant.displayName,
      ]),
    );
  }, [merchants.data?.results]);

  const transferCategoryId = useMemo(() => {
    const allCategories = categories.data?.results ?? [];
    return (
      allCategories.find((category) => category.kind === "TRANSFER")?.id ??
      allCategories.find((category) =>
        category.name.toLowerCase().includes("transfer"),
      )?.id ??
      null
    );
  }, [categories.data?.results]);

  const resolvedLegacyAccountId = useMemo(() => {
    if (accountId || !legacyAccountName) return accountId ?? null;
    const match = (accounts.data?.results ?? []).find(
      (currentAccount) => currentAccount.name === legacyAccountName,
    );
    return match?.id ?? null;
  }, [accountId, legacyAccountName, accounts.data?.results]);

  const shouldWaitForLegacyAccount =
    Boolean(legacyAccountName) && !accountId && accounts.loading;

  const effectiveAccountId =
    accountId ??
    (legacyAccountName
      ? (resolvedLegacyAccountId ??
        (accounts.loading ? undefined : "__missing__"))
      : undefined);

  const transactionParams = {
    ...period.params,
    page: String(page),
    pageSize: String(pageSize),
    ...(categoryId ? { categoryId } : {}),
    ...(merchantId ? { merchantId } : {}),
    ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
    ...(direction ? { direction } : {}),
    ...(query.trim() ? { q: query.trim() } : {}),
  };

  const transactions = useApi<TransactionsResponse>(
    shouldWaitForLegacyAccount ? null : "/api/domain/transactions",
    transactionParams,
  );

  function exportTransactions() {
    const params = new URLSearchParams(transactionParams);
    window.location.href = `/api/domain/transactions/export?${params.toString()}`;
  }

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    const nextQuery = deferredSearchInput.trim();
    if (nextQuery === query.trim()) return;

    const next = new URLSearchParams(searchParams.toString());
    if (nextQuery) {
      next.set("q", nextQuery);
    } else {
      next.delete("q");
    }
    next.delete("search");
    next.delete("page");

    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [deferredSearchInput, pathname, query, router, searchParams]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (searchParams.has("search")) {
      const legacySearch = searchParams.get("search")?.trim();
      if (legacySearch && !searchParams.get("q")) {
        next.set("q", legacySearch);
      }
      next.delete("search");
      changed = true;
    }

    if (legacyAccountName && !accountId && resolvedLegacyAccountId) {
      next.set("accountId", resolvedLegacyAccountId);
      next.delete("accountName");
      changed = true;
    }

    if (!changed) return;

    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [
    accountId,
    legacyAccountName,
    pathname,
    resolvedLegacyAccountId,
    router,
    searchParams,
  ]);

  function replaceParams(mutator: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutator(next);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function removeFilter(key: string) {
    replaceParams((next) => {
      next.delete(key);
      next.delete("page");
    });
  }

  function setDirection(nextDirection?: "INFLOW" | "OUTFLOW") {
    replaceParams((next) => {
      if (nextDirection) {
        next.set("direction", nextDirection);
      } else {
        next.delete("direction");
      }
      next.delete("page");
    });
  }

  function setPage(nextPage: number) {
    replaceParams((next) => {
      if (nextPage <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(nextPage));
      }
    });
  }

  function setPageSize(nextPageSize: number) {
    replaceParams((next) => {
      if (nextPageSize === 25) {
        next.delete("pageSize");
      } else {
        next.set("pageSize", String(nextPageSize));
      }
      next.delete("page");
    });
  }

  function clearAllFilters() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  function openTransaction(transaction: Transaction) {
    setSelectedTransaction(transaction);
    setDraftCategoryId(transaction.categoryId ?? "");
    setDraftMerchantName(transaction.merchantName ?? "");
    setDraftDescription(
      transaction.rawDescription ?? transaction.description ?? "",
    );
    setSheetOpen(true);
  }

  async function saveTransactionOverrides(extra?: Record<string, unknown>) {
    if (!selectedTransaction) return;
    setSavingOverride(true);
    try {
      const response = await fetch(
        `/api/domain/transactions/${selectedTransaction.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domainCategoryId: draftCategoryId || null,
            merchantName: draftMerchantName.trim() || null,
            description:
              draftDescription.trim() || selectedTransaction.description,
            ...extra,
          }),
        },
      );
      if (response.ok) {
        setSheetOpen(false);
        transactions.refetch();
      }
    } catch (error) {
      console.error("Failed to save transaction overrides", error);
    } finally {
      setSavingOverride(false);
    }
  }

  if (transactions.error) {
    return (
      <PageError message={transactions.error} refetch={transactions.refetch} />
    );
  }

  const total = transactions.data?.summary.total ?? 0;
  const results = transactions.data?.results ?? [];
  const totalPages = transactions.data?.meta.totalPages ?? 1;
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min(page * pageSize, total);
  const hasExplicitPeriod =
    searchParams.has("period") ||
    searchParams.has("from") ||
    searchParams.has("to");

  const activeFilters: FilterChip[] = [
    ...(hasExplicitPeriod
      ? [
          {
            key: "period",
            label: `Período: ${period.label}`,
            onRemove: () => {
              replaceParams((next) => {
                next.delete("period");
                next.delete("from");
                next.delete("to");
                next.delete("page");
              });
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
    ...((effectiveAccountId && effectiveAccountId !== "__missing__") ||
    legacyAccountName
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
                next.delete("accountId");
                next.delete("accountName");
                next.delete("page");
              });
            },
          },
        ]
      : []),
    ...(direction
      ? [
          {
            key: "direction",
            label:
              direction === "INFLOW" ? "Direção: entradas" : "Direção: saídas",
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
              setSearchInput("");
              replaceParams((next) => {
                next.delete("q");
                next.delete("search");
                next.delete("page");
              });
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Transações"
        title="Todas as movimentações"
        description={
          transactions.loading
            ? `Carregando transações (${period.label.toLowerCase()}).`
            : total === 1
              ? `1 transação encontrada (${period.label.toLowerCase()}) para os filtros atuais.`
              : `${total} transações encontradas (${period.label.toLowerCase()}) para os filtros atuais.`
        }
        actions={
          <div className="flex items-center gap-2">
            <PeriodSwitcher state={period} />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={exportTransactions}
              disabled={transactions.loading || total === 0}
              title="Exportar transações do período (CSV)"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
          </div>
        }
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
            className="font-mono text-xs"
            onClick={() => setDirection(undefined)}
          >
            ALL
          </Button>
          <Button
            variant={direction === "OUTFLOW" ? "secondary" : "outline"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => setDirection("OUTFLOW")}
          >
            OUT
          </Button>
          <Button
            variant={direction === "INFLOW" ? "secondary" : "outline"}
            size="sm"
            className="font-mono text-xs"
            onClick={() => setDirection("INFLOW")}
          >
            IN
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
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-mono text-sm tracking-wider text-muted-foreground uppercase whitespace-nowrap py-4 pl-4">
                    Data
                  </TableHead>
                  <TableHead className="font-mono text-sm tracking-wider text-muted-foreground uppercase py-4">
                    Descrição
                  </TableHead>
                  <TableHead className="hidden md:table-cell font-mono text-sm tracking-wider text-muted-foreground uppercase py-4">
                    Conta
                  </TableHead>
                  <TableHead className="hidden sm:table-cell font-mono text-sm tracking-wider text-muted-foreground uppercase py-4">
                    Categoria
                  </TableHead>
                  <TableHead className="text-right font-mono text-sm tracking-wider text-muted-foreground uppercase py-4 pr-4">
                    Valor
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((transaction) => {
                  const signedAmount =
                    transaction.direction === "INFLOW"
                      ? Math.abs(transaction.amount)
                      : -Math.abs(transaction.amount);
                  const title =
                    transaction.displayTitle ?? transaction.description;
                  const subtitle =
                    transaction.displaySubtitle ??
                    (transaction.merchantName &&
                    transaction.merchantName !== title
                      ? transaction.merchantName
                      : null);
                  const currentInstallmentLabel = installmentLabel(transaction);

                  return (
                    <TableRow
                      key={transaction.id}
                      className="group cursor-pointer border-border hover:bg-muted/40 transition-colors"
                      onClick={() => openTransaction(transaction)}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-sm text-muted-foreground/80 py-4 pl-4">
                        {formatDate(transaction.date)}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={cn(
                              "shrink-0 font-mono text-base font-black",
                              transaction.direction === "INFLOW"
                                ? "text-emerald-400"
                                : "text-rose-500",
                            )}
                          >
                            {transaction.direction === "INFLOW" ? "+" : "−"}
                          </span>
                          {transaction.merchantLogoUrl ? (
                            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-background p-1">
                              <LogoImage
                                src={transaction.merchantLogoUrl}
                                alt={title}
                                className="size-full object-contain"
                              />
                            </span>
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
                              {title}
                              {currentInstallmentLabel ? (
                                <Badge
                                  variant="outline"
                                  className="h-5 px-1.5 text-xs font-mono border-muted-foreground/30 text-muted-foreground"
                                >
                                  {currentInstallmentLabel}
                                </Badge>
                              ) : null}
                            </p>
                            {subtitle ? (
                              <p className="truncate text-sm font-medium text-muted-foreground/70">
                                {subtitle}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-4">
                        <div className="flex items-center gap-3">
                          {transaction.accountImageUrl ? (
                            <div className="shrink-0 size-7 rounded-lg border border-border/40 bg-muted/30 p-1 flex items-center justify-center overflow-hidden shadow-sm">
                              <LogoImage
                                src={transaction.accountImageUrl}
                                alt={transaction.accountName}
                                className="size-full object-contain"
                              />
                            </div>
                          ) : (
                            <div className="shrink-0 size-7 rounded-lg border border-border/40 bg-muted/50 flex items-center justify-center shadow-sm">
                              <span className="text-xs font-mono font-bold text-muted-foreground uppercase">
                                {transaction.accountName.slice(0, 2)}
                              </span>
                            </div>
                          )}
                          <span className="text-sm font-semibold text-muted-foreground/80 font-mono truncate max-w-32">
                            {transaction.accountName || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell py-4">
                        <Badge
                          variant="outline"
                          className="gap-1.5 py-1 px-2.5 font-mono text-sm border-border"
                          style={{
                            borderColor: `${getCategoryColor(transaction.categoryName)}80`,
                            color: getCategoryColor(transaction.categoryName),
                            backgroundColor: `${getCategoryColor(transaction.categoryName)}15`,
                          }}
                        >
                          <span aria-hidden className="text-base">
                            {getCategoryEmoji(transaction.categoryName)}
                          </span>
                          <span className="max-w-32 truncate font-medium">
                            {transaction.categoryName}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-base font-bold tabular-nums py-4",
                          "pr-4",
                          amountToneClass(signedAmount),
                        )}
                      >
                        {format(signedAmount)}
                      </TableCell>
                    </TableRow>
                  );
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
            <SheetTitle>
              {selectedTransaction?.displayTitle ??
                selectedTransaction?.description}
            </SheetTitle>
            <SheetDescription>
              {selectedTransaction?.displaySubtitle ??
                "Detalhes da transação selecionada."}
            </SheetDescription>
          </SheetHeader>

          {selectedTransaction ? (
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div
                className={cn(
                  "text-center text-2xl font-semibold tabular-nums",
                  amountToneClass(
                    selectedTransaction.direction === "INFLOW"
                      ? Math.abs(selectedTransaction.amount)
                      : -Math.abs(selectedTransaction.amount),
                  ),
                )}
              >
                {formatSigned(
                  selectedTransaction.direction === "INFLOW"
                    ? Math.abs(selectedTransaction.amount)
                    : -Math.abs(selectedTransaction.amount),
                  "always",
                )}
              </div>

              <Separator />

              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Descrição</span>
                  <span className="max-w-[60%] text-right font-medium">
                    {selectedTransaction.rawDescription ??
                      selectedTransaction.description}
                  </span>
                </div>
                {installmentLabel(selectedTransaction) ? (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Parcela</span>
                    <span>{installmentLabel(selectedTransaction)}</span>
                  </div>
                ) : null}
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
                    {selectedTransaction.direction === "INFLOW"
                      ? "Entrada"
                      : selectedTransaction.direction === "TRANSFER"
                        ? "Transferência"
                        : "Saída"}
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

              <Separator />

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Categoria
                  </span>
                  <Select
                    value={draftCategoryId || "__none__"}
                    onValueChange={(value) =>
                      setDraftCategoryId(value === "__none__" ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem categoria</SelectItem>
                      {(categories.data?.results ?? []).map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Merchant
                  </span>
                  <Input
                    value={draftMerchantName}
                    onChange={(event) =>
                      setDraftMerchantName(event.target.value)
                    }
                    placeholder="Nome do comerciante"
                  />
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Descrição
                  </span>
                  <Input
                    value={draftDescription}
                    onChange={(event) =>
                      setDraftDescription(event.target.value)
                    }
                    placeholder="Descrição da transação"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    disabled={savingOverride}
                    onClick={() => saveTransactionOverrides()}
                  >
                    {savingOverride ? "Salvando..." : "Salvar ajustes"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={savingOverride}
                    onClick={() =>
                      saveTransactionOverrides({
                        markInternalTransfer: true,
                        domainCategoryId: transferCategoryId,
                      })
                    }
                  >
                    Transferência interna
                  </Button>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={async () => {
                    if (!selectedTransaction) return;
                    const currentDate = new Date(selectedTransaction.date);
                    const nextMonth = new Date(currentDate);
                    nextMonth.setMonth(currentDate.getMonth() + 1);

                    try {
                      const res = await fetch(
                        `/api/domain/transactions/${selectedTransaction.id}`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            occurredAt: nextMonth.toISOString(),
                          }),
                        },
                      );
                      if (res.ok) {
                        setSheetOpen(false);
                        transactions.refetch();
                      }
                    } catch (error) {
                      console.error("Failed to update date", error);
                    }
                  }}
                >
                  <CalendarClock className="size-4" />
                  Adiar para o próximo mês
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start gap-2 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (!selectedTransaction) return;
                    try {
                      const res = await fetch(
                        `/api/domain/transactions/${selectedTransaction.id}`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ignored: !selectedTransaction.ignored,
                          }),
                        },
                      );
                      if (res.ok) {
                        setSheetOpen(false);
                        transactions.refetch();
                      }
                    } catch (error) {
                      console.error("Failed to toggle ignored", error);
                    }
                  }}
                >
                  <X className="size-4" />
                  {selectedTransaction.ignored
                    ? "Remover de ignorados"
                    : "Ignorar transação"}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
