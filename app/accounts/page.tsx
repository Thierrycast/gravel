"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Minus,
  Building2,
  Pencil,
  Wallet,
  AlertTriangle,
  CreditCard,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/hooks/use-api";
import { usePeriod } from "@/hooks/use-period";
import { formatDate, formatDateFull, formatPercent } from "@/lib/format";
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
import { PageHeader } from "@/components/page-header";
import { PeriodSwitcher } from "@/components/period-switcher";
import { EmptyState } from "@/components/ui/empty-state";
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
  type CardStatementsPayload,
  type CardStatementsResponse,
  type CardStatementStatus,
} from "@/lib/types/api";

const STATEMENT_STATUS_LABEL: Record<CardStatementStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  OVERDUE: "Vencida",
  PAID: "Paga",
  FUTURE: "Futura",
};

const STATEMENT_STATUS_CLASS: Record<CardStatementStatus, string> = {
  OPEN: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  CLOSED: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  OVERDUE: "bg-red-400/10 text-red-400 border-red-400/20",
  PAID: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  FUTURE: "bg-blue-400/10 text-blue-400 border-blue-400/20",
};

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

function getRelativeTime(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffInMinutes < 1) return "agora";
  if (diffInMinutes < 60) return `há ${diffInMinutes} min`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `há ${diffInHours} h`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `há ${diffInDays} d`;
}

type AccountWithRealtime = Account & {
  realtimeBalanceAt?: string | null;
  realtimeBalanceStatus?: string | null;
};

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
  const { data: statementsData, refetch: refetchStatements } =
    useApi<CardStatementsResponse>("/api/domain/cards/statements");

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [cashInput, setCashInput] = useState("");
  const [savingCash, setSavingCash] = useState(false);
  const [closingDayInput, setClosingDayInput] = useState("");
  const [dueDayInput, setDueDayInput] = useState("");
  const [savingBilling, setSavingBilling] = useState(false);

  const [updatingBalanceId, setUpdatingBalanceId] = useState<string | null>(null);
  const [balanceOverrides, setBalanceOverrides] = useState<
    Record<
      string,
      { balance: number; message: string; status: "OK" | "CACHED" | "ERROR"; updatedAt: string }
    >
  >({});

  const loading = accountsLoading || allocationLoading;

  useEffect(() => {
    if (selectedAccount) {
      setNicknameInput(selectedAccount.nickname || selectedAccount.name || "");
      setClosingDayInput(
        selectedAccount.billingClosingDay != null
          ? String(selectedAccount.billingClosingDay)
          : "",
      );
      setDueDayInput(
        selectedAccount.billingDueDay != null
          ? String(selectedAccount.billingDueDay)
          : "",
      );
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
  const statementsMap = new Map<string, CardStatementsPayload>(
    (statementsData?.results ?? []).map((entry) => [entry.accountId, entry]),
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

  async function handleUpdateBalance(e: React.MouseEvent, accountId: string) {
    e.stopPropagation();
    setUpdatingBalanceId(accountId);
    try {
      const res = await fetch(`/api/domain/accounts/${accountId}/balance`, {
        method: "POST",
      });
      const data = await res.json();
      const { ok, balance, message, source } = data.results;
      if (ok) {
        setBalanceOverrides((prev) => ({
          ...prev,
          [accountId]: {
            balance,
            status: source === "cached" ? "CACHED" : "OK",
            message: "",
            updatedAt: new Date().toISOString(),
          },
        }));
        toast.success("Saldo atualizado");
      } else {
        setBalanceOverrides((prev) => ({
          ...prev,
          [accountId]: {
            balance,
            status: "ERROR",
            message: message || "Erro ao atualizar",
            updatedAt: new Date().toISOString(),
          },
        }));
        toast.error(message || "Falha ao atualizar saldo");
      }
    } catch {
      toast.error("Erro ao atualizar saldo");
    } finally {
      setUpdatingBalanceId(null);
    }
  }

  async function handleBillingSave() {
    if (!selectedAccount) return;
    const closingDay = closingDayInput ? Number(closingDayInput) : null;
    const dueDay = dueDayInput ? Number(dueDayInput) : null;
    setSavingBilling(true);
    try {
      const res = await fetch(`/api/domain/accounts/${selectedAccount.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billingClosingDay: closingDay,
          billingDueDay: dueDay,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar ciclo de fatura");
      setSelectedAccount((prev) =>
        prev
          ? { ...prev, billingClosingDay: closingDay, billingDueDay: dueDay }
          : prev,
      );
      refetchAccounts();
      refetchStatements();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingBilling(false);
    }
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas"
        description="Bancos, carteiras e saldos atuais"
        actions={
          <Button variant="outline" asChild className="self-start sm:self-auto">
            <Link href="/connect">
              <Plus data-icon="inline-start" />
              Adicionar Conta
            </Link>
          </Button>
        }
      />

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
                  {group.accounts.map((acc) => {
                    const account = acc as AccountWithRealtime;
                    const allocation = allocationMap.get(account.id);
                    const credit = isCreditAccount(account);
                    
                    const override = balanceOverrides[account.id];
                    const displayBalance = override ? override.balance : account.balance;
                    const statusStr = override ? override.status : account.realtimeBalanceStatus;
                    const atStr = override ? override.updatedAt : account.realtimeBalanceAt;
                    
                    let balanceStatusText = "";
                    if (override && override.status === "OK") {
                      balanceStatusText = "atualizado agora";
                    } else if (override && override.status === "CACHED") {
                      balanceStatusText = "saldo salvo anteriormente";
                    } else if (override && override.status === "ERROR") {
                      balanceStatusText = "indisponível";
                    } else if (statusStr === "OK" && atStr) {
                      balanceStatusText = `saldo de ${getRelativeTime(atStr)}`;
                    } else if (atStr) {
                      balanceStatusText = `saldo de ${getRelativeTime(atStr)}`;
                    } else if (statusStr && statusStr !== "OK") {
                      balanceStatusText = "indisponível";
                    }

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
                          {credit ? (
                            (() => {
                              const statements = statementsMap.get(account.id);
                              if (!statements) {
                                return (
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                      Total em aberto
                                    </span>
                                    <span className="font-semibold text-destructive">
                                      {format(Math.abs(account.balance))}
                                    </span>
                                  </div>
                                );
                              }
                              if (!statements.configured) {
                                return (
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">
                                        Total em aberto
                                      </span>
                                      <span className="font-semibold text-destructive">
                                        {format(statements.totalOpen)}
                                      </span>
                                    </div>
                                    <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2.5 text-xs text-amber-500">
                                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                      <span>
                                        Para calcular corretamente as faturas
                                        deste cartão, adicione o dia de
                                        fechamento e o dia de vencimento nas
                                        configurações do cartão.
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              const upcomingTotal = statements.upcoming.reduce(
                                (sum, s) => sum + s.amount,
                                0,
                              );
                              const current = statements.current;
                              return (
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-muted-foreground">
                                      Fatura atual
                                    </span>
                                    <span className="flex items-center gap-2 font-semibold">
                                      {current && (
                                        <Badge
                                          variant="outline"
                                          className={`rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wider ${STATEMENT_STATUS_CLASS[current.status]}`}
                                        >
                                          {STATEMENT_STATUS_LABEL[current.status]}
                                        </Badge>
                                      )}
                                      <span
                                        className={
                                          current && current.amount > 0
                                            ? "text-destructive"
                                            : "text-foreground"
                                        }
                                      >
                                        {format(current?.amount ?? 0)}
                                      </span>
                                    </span>
                                  </div>
                                  {current && (
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                      <span>Vencimento</span>
                                      <span>{formatDate(current.dueDate)}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>
                                      Próximas faturas
                                      {statements.upcoming.length > 0 &&
                                        ` (${statements.upcoming.length})`}
                                    </span>
                                    <span className="tabular-nums">
                                      {format(upcomingTotal)}
                                    </span>
                                  </div>
                                  <Separator />
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Total em aberto
                                    </span>
                                    <span className="font-semibold tabular-nums text-destructive">
                                      {format(statements.totalOpen)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div>
                              <div className="mb-1 flex items-start justify-between text-sm">
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-muted-foreground">
                                    Saldo
                                  </span>
                                  {(account.kind === "BANK" || account.kind === "CASH") && (
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-5 w-5"
                                      onClick={(e) => handleUpdateBalance(e, account.id)}
                                      disabled={updatingBalanceId === account.id}
                                    >
                                      {updatingBalanceId === account.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <RefreshCw className="size-3 text-muted-foreground" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="break-words font-semibold text-foreground text-right">
                                    {format(displayBalance)}
                                  </span>
                                  {balanceStatusText && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {balanceStatusText}
                                    </span>
                                  )}
                                </div>
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
                          )}
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
        <EmptyState
          icon={Building2}
          title="Nenhuma conta conectada"
          description="Conecte suas contas bancárias para começar a acompanhar suas finanças."
          action={
            <Button asChild>
              <Link href="/connect">
                <Plus data-icon="inline-start" />
                Adicionar Conta
              </Link>
            </Button>
          }
        />
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

              {isCreditAccount(selectedAccount) && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="size-4 text-muted-foreground" />
                    Ciclo de fatura
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Informe os dias de fechamento e vencimento para separar a
                    fatura atual das próximas com precisão.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Dia de fechamento
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        placeholder="ex: 3"
                        value={closingDayInput}
                        onChange={(e) => setClosingDayInput(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Dia de vencimento
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        placeholder={
                          statementsMap.get(selectedAccount.id)
                            ?.suggestedDueDay
                            ? `sugerido: ${statementsMap.get(selectedAccount.id)?.suggestedDueDay}`
                            : "ex: 10"
                        }
                        value={dueDayInput}
                        onChange={(e) => setDueDayInput(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={savingBilling}
                    onClick={handleBillingSave}
                  >
                    {savingBilling ? "Salvando..." : "Salvar ciclo de fatura"}
                  </Button>
                  {!statementsMap.get(selectedAccount.id)?.configured && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-500">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      Sem o dia de fechamento, a fatura atual não pode ser
                      separada das próximas.
                    </p>
                  )}
                </div>
              )}

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
