"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Minus, Building2, Pencil, Wallet } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { usePeriod } from "@/hooks/use-period";
import { formatDateFull, formatPercent } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageError } from "@/components/page-error";
import { PeriodSwitcher } from "@/components/period-switcher";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

import {
  type Account,
  type AccountsResponse,
  type AllocationResponse,
} from "@/lib/types/api";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getTypeLabel(kind: string): string {
  const labels: Record<string, string> = {
    BANK: "Conta Bancária",
    CARD: "Cartão de Crédito",
    CREDIT: "Cartão de Crédito",
    SAVINGS: "Poupança",
    CHECKING: "Conta Corrente",
    INVESTMENT: "Investimento",
    CASH: "Carteira Física",
    OTHER: "Outro",
    // Pluggy raw subtype values
    CHECKING_ACCOUNT: "Conta Corrente",
    CREDIT_CARD: "Cartão de Crédito",
    SAVINGS_ACCOUNT: "Poupança",
    PAYMENT_ACCOUNT: "Conta de Pagamento",
    CASH_MANAGEMENT: "Gestão de Caixa",
  };
  return labels[kind] || kind;
}

function isCreditAccount(account: Account): boolean {
  return account.kind === "CARD" || account.kind === "CREDIT";
}

function AccountCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-28" />
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const { format } = useCurrency();
  const period = usePeriod("mtd");
  const {
    data: accountsData,
    loading: accountsLoading,
    error: accountsError,
    refetch: refetchAccounts,
  } = useApi<AccountsResponse>("/api/domain/accounts");
  const {
    data: allocationData,
    loading: allocationLoading,
    error: allocationError,
    refetch: refetchAllocation,
  } = useApi<AllocationResponse>("/api/domain/metrics/accounts/allocation");

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [savingCash, setSavingCash] = useState(false);

  const loading = accountsLoading || allocationLoading;

  useEffect(() => {
    if (selectedAccount) {
      setNicknameInput(selectedAccount.nickname || selectedAccount.name || "");
    }
  }, [selectedAccount]);

  if (accountsError || allocationError) {
    return (
      <PageError
        message="Erro ao carregar contas e saldos"
        refetch={() => {
          refetchAccounts();
          refetchAllocation();
        }}
      />
    );
  }

  const accounts = accountsData?.results ?? [];
  const totalCredit =
    Math.abs(allocationData?.summary.byKind.CARD ?? 0) +
    Math.abs(allocationData?.summary.byKind.CREDIT ?? 0);
  const totalBank =
    (allocationData?.summary.byKind.BANK ?? 0) +
    (allocationData?.summary.byKind.CASH ?? 0) +
    (allocationData?.summary.byKind.INVESTMENT ?? 0) +
    (allocationData?.summary.byKind.OTHER ?? 0);

  const allocationMap = new Map(
    (allocationData?.results ?? []).map((r) => [r.accountId, r]),
  );
  const institutionGroups = Array.from(
    accounts
      .reduce(
        (groups, account) => {
          const key = account.institution || "Sem instituição";
          const current = groups.get(key) ?? {
            institution: key,
            logoUrl: account.imageUrl ?? null,
            accounts: [] as Account[],
            balance: 0,
            creditDebt: 0,
          };
          current.accounts.push(account);
          if (!current.logoUrl && account.imageUrl)
            current.logoUrl = account.imageUrl;
          if (isCreditAccount(account)) {
            current.creditDebt += Math.abs(account.balance);
          } else {
            current.balance += account.balance;
          }
          groups.set(key, current);
          return groups;
        },
        new Map<
          string,
          {
            institution: string;
            logoUrl: string | null;
            accounts: Account[];
            balance: number;
            creditDebt: number;
          }
        >(),
      )
      .values(),
  ).sort((left, right) => left.institution.localeCompare(right.institution));

  function handleAccountClick(account: Account) {
    setSelectedAccount(account);
    setCashInput("");
    setSheetOpen(true);
  }

  async function handleCashAdjust(direction: "add" | "remove") {
    if (!selectedAccount) return;
    const amount = parseFloat(cashInput.replace(",", "."));
    if (!isFinite(amount) || amount <= 0) return;
    const delta = direction === "add" ? amount : -amount;
    setSavingCash(true);
    try {
      const res = await fetch(`/api/domain/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error("Erro ao ajustar saldo");
      setSelectedAccount((prev) =>
        prev ? { ...prev, balance: prev.balance + delta } : prev,
      );
      setCashInput("");
      refetchAccounts();
      refetchAllocation();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCash(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Contas
          </h1>
          <p className="text-muted-foreground">
            Bancos, carteiras e saldos atuais
          </p>
        </div>
        <Button variant="outline" asChild className="self-start sm:self-auto">
          <Link href="/connect">
            <Plus data-icon="inline-start" />
            Adicionar Conta
          </Link>
        </Button>
      </div>

      {/* Period Selector */}
      <div className="flex justify-start sm:justify-end">
        <PeriodSwitcher state={period} />
      </div>

      {/* Summary Cards */}
      {!loading && allocationData && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Saldo líquido nas contas</CardDescription>
              <CardTitle
                className={`break-words font-mono text-2xl ${
                  allocationData.summary.totalBalance >= 0
                    ? "text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {format(allocationData.summary.totalBalance)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Contas Bancárias</CardDescription>
              <CardTitle className="break-words font-mono text-2xl">
                {format(totalBank)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Dívida em Cartões</CardDescription>
              <CardTitle
                className={`break-words font-mono text-2xl ${totalCredit > 0 ? "text-destructive" : "text-emerald-400"}`}
              >
                {format(totalCredit)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {loading && (
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
      )}

      {/* Institution groups */}
      <div className="space-y-6">
        {loading
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <AccountCardSkeleton />
                <AccountCardSkeleton />
                <AccountCardSkeleton />
              </div>
            ))
          : institutionGroups.map((group) => (
              <section key={group.institution} className="space-y-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar>
                      <AvatarImage src={group.logoUrl || undefined} />
                      <AvatarFallback>
                        {getInitials(group.institution)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h2 className="break-words text-xl font-semibold">
                        {group.institution}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">
                          {group.accounts.length}
                        </Badge>
                        {group.balance !== 0 && (
                          <span>Saldo {format(group.balance)}</span>
                        )}
                        {group.creditDebt > 0 && (
                          <span className="text-destructive">
                            Cartões {format(group.creditDebt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.accounts.map((account) => {
                    const allocation = allocationMap.get(account.id);
                    const credit = isCreditAccount(account);
                    return (
                      <Card
                        key={account.id}
                        className="min-w-0 cursor-pointer transition-shadow hover:shadow-md"
                        onClick={() => handleAccountClick(account)}
                      >
                        <CardHeader>
                          <div className="flex min-w-0 items-start gap-3">
                            <Avatar>
                              <AvatarImage
                                src={account.imageUrl || undefined}
                              />
                              <AvatarFallback>
                                {getInitials(
                                  account.institution || account.name,
                                )}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div
                                className="truncate font-medium"
                                title={account.name}
                              >
                                {account.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {account.institution}
                              </div>
                              <Badge
                                variant={credit ? "secondary" : "outline"}
                                className="max-w-full truncate"
                              >
                                {getTypeLabel(account.subtype || account.kind)}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <div className="mb-1 grid gap-1 text-sm sm:flex sm:items-center sm:justify-between sm:gap-2">
                              <span className="text-muted-foreground">
                                {credit ? "Fatura Atual" : "Saldo"}
                              </span>
                              <span
                                className={`break-words font-semibold sm:text-right ${
                                  credit && account.balance > 0
                                    ? "text-destructive"
                                    : "text-foreground"
                                }`}
                              >
                                {format(
                                  credit
                                    ? Math.abs(account.balance)
                                    : account.balance,
                                )}
                              </span>
                            </div>
                            {allocation && (
                              <>
                                <Progress
                                  value={Math.min(allocation.percentage, 100)}
                                />
                                <div className="mt-1 text-xs text-muted-foreground sm:text-right">
                                  {formatPercent(allocation.percentage)} do
                                  saldo positivo em contas
                                </div>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
      </div>

      {/* Empty State */}
      {!loading && accounts.length === 0 && (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center text-center">
            <Building2 className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Nenhuma conta conectada
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Conecte suas contas bancárias para começar a acompanhar suas
              finanças.
            </p>
            <Button asChild>
              <Link href="/connect">
                <Plus data-icon="inline-start" />
                Adicionar Conta
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Account Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedAccount?.name}</SheetTitle>
            <SheetDescription>{selectedAccount?.institution}</SheetDescription>
          </SheetHeader>
          {selectedAccount && (
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarImage src={selectedAccount.imageUrl || undefined} />
                  <AvatarFallback>
                    {getInitials(
                      selectedAccount.institution || selectedAccount.name,
                    )}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{selectedAccount.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedAccount.institution}
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Tipo</span>
                  <Badge variant="outline">
                    {getTypeLabel(
                      selectedAccount.subtype || selectedAccount.kind,
                    )}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Apelido</span>
                  {editingNickname ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={nicknameInput}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        className="w-32 h-7 text-sm"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          setSavingNickname(true);
                          try {
                            const res = await fetch(
                              `/api/domain/accounts/${selectedAccount.id}`,
                              {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  nickname: nicknameInput.trim() || null,
                                }),
                              },
                            );
                            if (res.ok) {
                              setEditingNickname(false);
                              refetchAccounts();
                            }
                          } catch (error) {
                            console.error("Failed to update nickname", error);
                          } finally {
                            setSavingNickname(false);
                          }
                        }}
                        disabled={savingNickname}
                      >
                        {savingNickname ? "..." : "Salvar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingNickname(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {selectedAccount.nickname || selectedAccount.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditingNickname(true);
                          setNicknameInput(
                            selectedAccount.nickname ||
                              selectedAccount.name ||
                              "",
                          );
                        }}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Saldo</span>
                  <span
                    className={`font-semibold ${
                      selectedAccount.kind === "CARD" ||
                      selectedAccount.kind === "CREDIT"
                        ? "text-destructive"
                        : ""
                    }`}
                  >
                    {format(
                      selectedAccount.kind === "CARD" ||
                        selectedAccount.kind === "CREDIT"
                        ? Math.abs(selectedAccount.balance)
                        : selectedAccount.balance,
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Moeda</span>
                  <span className="text-sm">
                    {selectedAccount.currencyCode}
                  </span>
                </div>
                {selectedAccount.number && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Final</span>
                    <span className="text-sm font-mono">
                      ****{selectedAccount.number.slice(-4)}
                    </span>
                  </div>
                )}
                {selectedAccount.ownerName && (
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Titular
                    </span>
                    <span className="max-w-[60%] text-right text-sm">
                      {selectedAccount.ownerName}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Transações
                  </span>
                  <span className="text-sm tabular-nums">
                    {selectedAccount.transactionCount ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total gasto
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {format(selectedAccount.totalSpent ?? 0)}
                  </span>
                </div>
                {(selectedAccount.firstTransactionAt ||
                  selectedAccount.createdAt) && (
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Desde</span>
                    <span className="text-right text-sm">
                      {formatDateFull(
                        selectedAccount.firstTransactionAt ??
                          selectedAccount.createdAt,
                      )}
                    </span>
                  </div>
                )}
                {selectedAccount.lastTransactionAt && (
                  <div className="flex justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      Último uso
                    </span>
                    <span className="text-right text-sm">
                      {formatDateFull(selectedAccount.lastTransactionAt)}
                    </span>
                  </div>
                )}
                {selectedAccount.sourceProvider && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Origem
                    </span>
                    <span className="text-sm">
                      {selectedAccount.sourceProvider}
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              {(() => {
                const allocation = allocationMap.get(selectedAccount.id);
                if (!allocation) return null;
                return (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Alocação entre contas
                    </div>
                    <Progress value={Math.min(allocation.percentage, 100)} />
                    <div className="text-xs text-muted-foreground">
                      {formatPercent(allocation.percentage)} do saldo positivo (
                      {format(allocation.balance)})
                    </div>
                  </div>
                );
              })()}

              {selectedAccount.kind === "CASH" && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="size-4 text-muted-foreground" />
                    Ajustar saldo em dinheiro
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Valor (ex: 50.00)"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={
                        savingCash ||
                        !cashInput ||
                        parseFloat(cashInput.replace(",", ".")) <= 0
                      }
                      onClick={() => handleCashAdjust("add")}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Adicionar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1"
                      disabled={
                        savingCash ||
                        !cashInput ||
                        parseFloat(cashInput.replace(",", ".")) <= 0
                      }
                      onClick={() => handleCashAdjust("remove")}
                    >
                      <Minus className="size-3.5 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              )}

              <Button variant="outline" asChild className="mt-2">
                <Link
                  href={`/transactions?accountId=${selectedAccount.id}&period=${period.period}`}
                >
                  Ver Transações
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
