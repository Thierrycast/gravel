"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { formatDate, daysUntil, daysUntilLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { PageError } from "@/components/page-error";

interface Bill {
  id: string;
  accountId: string | null;
  accountName: string;
  institutionName: string | null;
  dueDate: string;
  totalAmount: number;
  minimumPayment: number;
  status: string;
  paidAt?: string | null;
  closingDate: string;
}


interface BillsSummary {
  totalOpen: number;
  totalOverdue: number;
  totalPaid: number;
  counts: {
    total: number;
    open: number;
    overdue: number;
    paid: number;
  };
  upcoming: Bill[];
}

interface BillsResponse {
  results: Bill[];
}

interface BillsSummaryResponse {
  summary: BillsSummary;
}

const DISPLAY_CURRENCY_THRESHOLD = 0.005;

function normalizeDisplayedAmount(value: number): number {
  return Math.abs(value) < DISPLAY_CURRENCY_THRESHOLD ? 0 : value;
}

function normalizeDisplayedBill(bill: Bill): Bill {
  const totalAmount = normalizeDisplayedAmount(bill.totalAmount);
  const status = bill.paidAt
    ? "PAID"
    : totalAmount === 0 && bill.status !== "PAID"
      ? "CLOSED"
      : bill.status;
  return {
    ...bill,
    accountName: bill.accountName.trim(),
    institutionName: bill.institutionName?.trim() ?? null,
    totalAmount,
    minimumPayment: normalizeDisplayedAmount(bill.minimumPayment),
    status,
  };
}

function getStatusConfig(status: string, dueDate: string, totalAmount: number) {
  const days = daysUntil(dueDate);

  if (status === "PAID") {
    return {
      label: "Paga",
      className: "bg-blue-400/10 text-blue-400 border-blue-400/20",
      icon: CheckCircle2,
      dotColor: "bg-blue-400",
    };
  }
  if (totalAmount === 0) {
    return {
      label: "Sem saldo",
      className: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
      icon: CheckCircle2,
      dotColor: "bg-emerald-400",
    };
  }
  if (status === "CLOSED") {
    return {
      label: "Fechada",
      className: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
      icon: CheckCircle2,
      dotColor: "bg-emerald-400",
    };
  }
  if (days < 0) {
    return {
      label: "Vencida",
      className: "bg-red-400/10 text-red-400 border-red-400/20",
      icon: AlertCircle,
      dotColor: "bg-red-400",
    };
  }
  if (days <= 7) {
    return {
      label: "A vencer",
      className: "bg-amber-400/10 text-amber-400 border-amber-400/20",
      icon: Clock,
      dotColor: "bg-amber-400",
    };
  }
  return {
    label: "Aberta",
    className: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
    icon: Calendar,
    dotColor: "bg-zinc-400",
  };
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export default function BillsPage() {
  const { format } = useCurrency();
  const formatBillAmount = (value: number) =>
    format(normalizeDisplayedAmount(value));
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [payingBillId, setPayingBillId] = useState<string | null>(null);

  const monthParam = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;

  const {
    data: billsData,
    loading: billsLoading,
    error: billsError,
    refetch: refetchBills,
  } = useApi<BillsResponse>("/api/domain/bills", { month: monthParam });

  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useApi<BillsSummaryResponse>("/api/domain/metrics/bills/summary", {
    month: monthParam,
  });

  const loading = billsLoading || summaryLoading;

  const bills = billsData?.results;
  const sourceSummary = summaryData?.summary;
  const displayedBills = useMemo(
    () => (bills ?? []).map(normalizeDisplayedBill),
    [bills],
  );


  const summary = useMemo(() => {
    if (!sourceSummary || !bills) return sourceSummary;

    const amounts = displayedBills.reduce(
      (totals, bill) => {
        if (bill.status === "OVERDUE") {
          totals.overdue += bill.totalAmount;
          totals.overdueCount += 1;
        } else if (bill.status === "OPEN") {
          totals.open += bill.totalAmount;
          totals.openCount += 1;
        } else if (bill.status === "PAID" || bill.status === "CLOSED") {
          totals.paid += bill.totalAmount;
          totals.paidCount += 1;
        }
        return totals;
      },
      {
        open: 0,
        overdue: 0,
        paid: 0,
        openCount: 0,
        overdueCount: 0,
        paidCount: 0,
      },
    );

    return {
      totalOpen: amounts.open,
      totalOverdue: amounts.overdue,
      totalPaid: amounts.paid,
      counts: {
        total: displayedBills.length,
        open: amounts.openCount,
        overdue: amounts.overdueCount,
        paid: amounts.paidCount,
      },
      upcoming: sourceSummary.upcoming
        .map(normalizeDisplayedBill)
        .filter((bill) => bill.status === "OPEN"),
    };
  }, [bills, displayedBills, sourceSummary]);

  const sortedBills = useMemo(() => {
    return displayedBills
      .filter((bill) => {
        // Drop CLOSED bills with zero amount — they are noise (no action needed)
        if (bill.status === "CLOSED" && bill.totalAmount === 0) return false;
        return true;
      })
      .sort((a, b) => {
        const statusOrder: Record<string, number> = {
          OVERDUE: 0,
          OPEN: 1,
          CLOSED: 2,
          PAID: 3,
        };
        const aOrder = statusOrder[a.status] ?? 1;
        const bOrder = statusOrder[b.status] ?? 1;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [displayedBills]);

  if (billsError || summaryError) {
    return (
      <PageError
        message="Erro ao carregar faturas"
        refetch={() => {
          refetchBills();
          refetchSummary();
        }}
      />
    );
  }

  const totalAmount = summary
    ? summary.totalOpen + summary.totalOverdue + summary.totalPaid
    : 0;

  function navigateToPreviousMonth() {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((month) => month - 1);
    }
  }

  function navigateToNextMonth() {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((month) => month + 1);
    }
  }

  function resetToToday() {
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
  }

  async function markBillAsPaid(billId: string) {
    setPayingBillId(billId);
    try {
      const response = await fetch(`/api/domain/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("Falha ao marcar fatura como paga");
      refetchBills();
      refetchSummary();
    } catch (error) {
      console.error(error);
    } finally {
      setPayingBillId(null);
    }
  }

  const isCurrentMonth =
    selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const isFutureMonth =
    new Date(selectedYear, selectedMonth, 1) >
    new Date(now.getFullYear(), now.getMonth(), 1);
  const periodDescription = isCurrentMonth
    ? "Mês atual"
    : isFutureMonth
      ? "Período futuro - exibe faturas disponíveis"
      : "Período histórico";

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      {/* Period Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Faturas
        </h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            {!isCurrentMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={resetToToday}
              >
                Hoje
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={navigateToPreviousMonth}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span
              className="min-w-[110px] text-center text-sm font-semibold capitalize sm:min-w-[160px]"
              aria-live="polite"
            >
              {monthNames[selectedMonth]} de {selectedYear}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={navigateToNextMonth}
              aria-label="Próximo mês"
              disabled={
                new Date(selectedYear, selectedMonth + 1, 1) >
                new Date(now.getFullYear(), now.getMonth() + 2, 1)
              }
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <p
            className={cn(
              "text-[11px]",
              isCurrentMonth
                ? "font-semibold text-primary"
                : "text-muted-foreground",
            )}
          >
            {isCurrentMonth && (
              <span className="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" />
            )}
            {periodDescription}
          </p>
        </div>
      </div>

      {/* Hero Card */}
      {loading ? (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-48" />
          <div className="flex gap-8">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ) : summary ? (
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Total das Faturas
          </p>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-pink-400">
            {formatBillAmount(totalAmount)}
          </p>

          {/* Breakdown by status */}
          <div className="flex flex-wrap gap-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Abertas
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formatBillAmount(summary.totalOpen)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-red-400">
                Vencidas
              </p>
              <p className="text-sm font-semibold tabular-nums text-red-400">
                {formatBillAmount(summary.totalOverdue)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">
                Pagas
              </p>
              <p className="text-sm font-semibold tabular-nums text-emerald-400">
                {formatBillAmount(summary.totalPaid)}
              </p>
            </div>
          </div>

          {/* Progress bar showing composition */}
          <div className="flex h-1.5 rounded-full bg-muted/50 overflow-hidden">
            {totalAmount > 0 && (
              <>
                <div
                  className="h-full bg-zinc-400 rounded-l-full"
                  style={{
                    width: `${(summary.totalOpen / totalAmount) * 100}%`,
                  }}
                />
                <div
                  className="h-full bg-red-400"
                  style={{
                    width: `${(summary.totalOverdue / totalAmount) * 100}%`,
                  }}
                />
                <div
                  className="h-full bg-emerald-400 rounded-r-full"
                  style={{
                    width: `${(summary.totalPaid / totalAmount) * 100}%`,
                  }}
                />
              </>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-zinc-400" />
              Abertas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-red-400" />
              Vencidas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              Pagas
            </span>
          </div>
        </div>
      ) : null}

      {/* Status summary pills */}
      {!loading && summary && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Abertas
            </p>
            <p className="text-lg font-bold tabular-nums">
              {summary.counts.open}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatBillAmount(summary.totalOpen)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-red-400">
              Vencidas
            </p>
            <p className="text-lg font-bold tabular-nums text-red-400">
              {summary.counts.overdue}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatBillAmount(summary.totalOverdue)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400">
              Pagas
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-400">
              {summary.counts.paid}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatBillAmount(summary.totalPaid)}
            </p>
          </div>
        </div>
      )}

      {/* Bills list */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Faturas do Periodo
        </p>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBills.map((bill) => {
              const statusConfig = getStatusConfig(
                bill.status,
                bill.dueDate,
                bill.totalAmount,
              );
              const StatusIcon = statusConfig.icon;
              const days = daysUntil(bill.dueDate);

              return (
                <div
                  key={bill.id}
                  className="rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  {/* Row 1: avatar + info */}
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {getInitials(bill.accountName)}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold truncate max-w-[12rem]">
                          {bill.accountName}
                        </span>
                        {bill.institutionName && (
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono opacity-70 hidden sm:inline">
                            {bill.institutionName}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 rounded-full border px-2 py-0 text-xs font-semibold uppercase tracking-wider",
                            statusConfig.className,
                          )}
                        >
                          <StatusIcon className="mr-1 size-2.5" />
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          Vence {formatDate(bill.dueDate)}
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            days < 0
                              ? "text-red-400"
                              : days <= 3
                                ? "text-amber-400"
                                : "text-muted-foreground",
                          )}
                        >
                          {bill.status === "PAID"
                            ? "Paga"
                            : daysUntilLabel(bill.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: amount + actions, indented to align with info */}
                  <div className="mt-3 flex items-center justify-between pl-[calc(2.25rem+0.75rem)]">
                    <div className="space-y-0.5">
                      <p className="text-base font-bold tabular-nums text-pink-400">
                        {formatBillAmount(bill.totalAmount)}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        Min: {formatBillAmount(bill.minimumPayment)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(bill.status === "OPEN" || bill.status === "OVERDUE") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-8 px-3 text-xs"
                          disabled={payingBillId === bill.id}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            markBillAsPaid(bill.id);
                          }}
                        >
                          <CheckCircle2 className="size-3.5" />
                          {payingBillId === bill.id ? "..." : "Paga"}
                        </Button>
                      )}
                      <Link
                        href={
                          bill.accountId
                            ? `/transactions?accountId=${bill.accountId}`
                            : "/transactions"
                        }
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty State */}
      {!loading && displayedBills.length === 0 && (
        <EmptyState
          className="bg-card/50 py-20"
          icon={CreditCard}
          title="Nenhuma fatura encontrada"
          description={`Não identificamos registros de faturas para o período de ${monthNames[selectedMonth]} de ${selectedYear}.`}
        />
      )}

      {/* Upcoming Bills */}
      {!loading && summary?.upcoming && summary.upcoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Próximos vencimentos
          </p>
          <div className="rounded-xl border bg-card divide-y">
            {summary.upcoming.map((bill) => {
              const statusConfig = getStatusConfig(
                bill.status,
                bill.dueDate,
                bill.totalAmount,
              );
              return (
                <div
                  key={bill.id}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {getInitials(bill.accountName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {bill.accountName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(bill.dueDate)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">
                      {formatBillAmount(bill.totalAmount)}
                    </p>
                    <p
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        statusConfig.className.split(" ")[1],
                      )}
                    >
                      {statusConfig.label}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      statusConfig.dotColor,
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
