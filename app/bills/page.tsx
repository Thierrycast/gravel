"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  History,
  Receipt,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { formatDate, daysUntilLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { PageError } from "@/components/page-error";
import { PageHeader } from "@/components/page-header";
import type {
  CardStatement,
  CardStatementsPayload,
  CardStatementsResponse,
  CardStatementStatus,
} from "@/lib/types/api";

const STATUS_LABEL: Record<CardStatementStatus, string> = {
  OPEN: "Aberta",
  CLOSED: "Fechada",
  OVERDUE: "Vencida",
  PAID: "Paga",
  FUTURE: "Futura",
};

const STATUS_CLASS: Record<CardStatementStatus, string> = {
  OPEN: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  CLOSED: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  OVERDUE: "bg-red-400/10 text-red-400 border-red-400/20",
  PAID: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  FUTURE: "bg-blue-400/10 text-blue-400 border-blue-400/20",
};

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

function StatusBadge({ status }: { status: CardStatementStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wider",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function cycleTransactionsHref(statement: CardStatement) {
  const from = statement.periodStart.slice(0, 10);
  const to = statement.periodEnd.slice(0, 10);
  return `/transactions?accountId=${statement.accountId}&period=custom&from=${from}&to=${to}`;
}

function StatementRow({
  statement,
  formatAmount,
  onMarkPaid,
  paying,
}: {
  statement: CardStatement;
  formatAmount: (value: number) => string;
  onMarkPaid?: (billId: string) => void;
  paying?: boolean;
}) {
  const canMarkPaid =
    onMarkPaid &&
    statement.providerBillId &&
    (statement.status === "OVERDUE" || statement.status === "CLOSED");

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium tabular-nums">
            {formatDate(statement.periodStart)} –{" "}
            {formatDate(statement.periodEnd)}
          </span>
          <StatusBadge status={statement.status} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Vence {formatDate(statement.dueDate)}
          {statement.transactionCount > 0 &&
            ` · ${statement.transactionCount} transações`}
          {statement.reconciled && " · valor do banco"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {formatAmount(statement.amount)}
        </p>
        {statement.minimumPayment != null && statement.minimumPayment > 0 && (
          <p className="text-xs tabular-nums text-muted-foreground">
            Mín: {formatAmount(statement.minimumPayment)}
          </p>
        )}
      </div>
      {canMarkPaid && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={paying}
          onClick={() => onMarkPaid(statement.providerBillId as string)}
        >
          <CheckCircle2 className="size-3" />
          {paying ? "..." : "Paga"}
        </Button>
      )}
      <Link
        href={cycleTransactionsHref(statement)}
        className="text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Ver transações do ciclo"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function CardSection({
  card,
  formatAmount,
  onMarkPaid,
  payingBillId,
}: {
  card: CardStatementsPayload;
  formatAmount: (value: number) => string;
  onMarkPaid: (billId: string) => void;
  payingBillId: string | null;
}) {
  const [showPast, setShowPast] = useState(false);
  const upcomingTotal = card.upcoming.reduce((sum, s) => sum + s.amount, 0);
  const overdue = card.past.filter((s) => s.status === "OVERDUE");

  return (
    <section className="rounded-xl border bg-card">
      {/* Card header */}
      <div className="flex items-center gap-3 p-4 sm:p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {getInitials(card.accountName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold">
              {card.accountName}
            </h2>
            {card.institutionName && (
              <span className="hidden text-[10px] font-mono uppercase tracking-wider text-muted-foreground opacity-70 sm:inline">
                {card.institutionName}
              </span>
            )}
          </div>
          {card.configured ? (
            <p className="text-xs text-muted-foreground">
              Fecha dia {card.closingDay} · vence dia {card.dueDay ?? "—"}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ciclo de fatura não configurado
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total em aberto</p>
          <p className="text-sm font-bold tabular-nums text-pink-400">
            {formatAmount(card.totalOpen)}
          </p>
        </div>
      </div>

      {!card.configured ? (
        <div className="border-t p-4 sm:p-5">
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="space-y-2 text-sm">
              <p className="text-amber-500">
                Para calcular corretamente as faturas deste cartão, adicione o
                dia de fechamento e o dia de vencimento nas configurações do
                cartão.
              </p>
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <Link href="/accounts">Configurar cartão</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Current statement */}
          <div className="border-t p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Fatura atual
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                  {formatAmount(card.current?.amount ?? 0)}
                </p>
                {card.current && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    {formatDate(card.current.periodStart)} –{" "}
                    {formatDate(card.current.periodEnd)} · vence{" "}
                    {formatDate(card.current.dueDate)} (
                    {daysUntilLabel(card.current.dueDate)})
                  </p>
                )}
              </div>
              {card.current && (
                <div className="flex items-center gap-2">
                  <StatusBadge status={card.current.status} />
                  <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                    <Link href={cycleTransactionsHref(card.current)}>
                      Ver transações
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Overdue alert */}
          {overdue.length > 0 && (
            <div className="border-t px-4 py-3 sm:px-5">
              <p className="flex items-center gap-2 text-xs font-semibold text-red-400">
                <AlertTriangle className="size-3.5" />
                {overdue.length === 1
                  ? `1 fatura vencida (${formatAmount(overdue[0].amount)})`
                  : `${overdue.length} faturas vencidas (${formatAmount(overdue.reduce((s, b) => s + b.amount, 0))})`}
              </p>
            </div>
          )}

          {/* Upcoming statements */}
          {card.upcoming.length > 0 && (
            <div className="border-t">
              <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Próximas faturas
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatAmount(upcomingTotal)} em {card.upcoming.length}{" "}
                  {card.upcoming.length === 1 ? "fatura" : "faturas"}
                </p>
              </div>
              <div className="divide-y">
                {card.upcoming.slice(0, 6).map((statement) => (
                  <StatementRow
                    key={statement.id}
                    statement={statement}
                    formatAmount={formatAmount}
                  />
                ))}
              </div>
              {card.upcoming.length > 6 && (
                <p className="px-4 pb-3 text-xs text-muted-foreground sm:px-5">
                  + {card.upcoming.length - 6} faturas futuras (parcelamentos
                  longos)
                </p>
              )}
            </div>
          )}

          {/* Past statements */}
          {card.past.length > 0 && (
            <div className="border-t">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-5"
                onClick={() => setShowPast((value) => !value)}
              >
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  <History className="size-3.5" />
                  Faturas passadas ({card.past.length})
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    showPast && "rotate-180",
                  )}
                />
              </button>
              {showPast && (
                <div className="divide-y border-t">
                  {card.past.slice(0, 12).map((statement) => (
                    <StatementRow
                      key={statement.id}
                      statement={statement}
                      formatAmount={formatAmount}
                      onMarkPaid={onMarkPaid}
                      paying={payingBillId === statement.providerBillId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function BillsPage() {
  const { format } = useCurrency();
  const [payingBillId, setPayingBillId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApi<CardStatementsResponse>(
    "/api/domain/cards/statements",
  );

  const cards = useMemo(() => data?.results ?? [], [data]);
  const configured = cards.filter((card) => card.configured);
  const unconfigured = cards.filter((card) => !card.configured);

  const totals = useMemo(() => {
    const current = configured.reduce(
      (sum, card) => sum + (card.current?.amount ?? 0),
      0,
    );
    const upcoming = configured.reduce(
      (sum, card) =>
        sum + card.upcoming.reduce((inner, s) => inner + s.amount, 0),
      0,
    );
    const overdue = configured.reduce(
      (sum, card) =>
        sum +
        card.past
          .filter((s) => s.status === "OVERDUE")
          .reduce((inner, s) => inner + s.amount, 0),
      0,
    );
    const open = cards.reduce((sum, card) => sum + card.totalOpen, 0);
    return { current, upcoming, overdue, open };
  }, [cards, configured]);

  async function markBillAsPaid(billId: string) {
    setPayingBillId(billId);
    try {
      const response = await fetch(`/api/domain/bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error("Falha ao marcar fatura como paga");
      refetch();
    } catch (err) {
      console.error(err);
    } finally {
      setPayingBillId(null);
    }
  }

  if (error) {
    return <PageError message="Erro ao carregar faturas" refetch={refetch} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Faturas"
        description="Faturas de cartão separadas por ciclo: atual, próximas e passadas"
      />

      {/* Summary */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-24" />
            </div>
          ))}
        </div>
      ) : (
        cards.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Faturas atuais
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {format(totals.current)}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Próximas faturas
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {format(totals.upcoming)}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.15em]",
                  totals.overdue > 0 ? "text-red-400" : "text-muted-foreground",
                )}
              >
                Vencidas
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-bold tabular-nums",
                  totals.overdue > 0 && "text-red-400",
                )}
              >
                {format(totals.overdue)}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Total em aberto
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-pink-400">
                {format(totals.open)}
              </p>
            </div>
          </div>
        )
      )}

      {/* Cards */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-16" />
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          className="bg-card/50 py-20"
          icon={CreditCard}
          title="Nenhum cartão de crédito encontrado"
          description="Conecte um cartão de crédito em Conexões para acompanhar as faturas por ciclo."
        />
      ) : (
        <div className="space-y-4">
          {configured.map((card) => (
            <CardSection
              key={card.accountId}
              card={card}
              formatAmount={format}
              onMarkPaid={markBillAsPaid}
              payingBillId={payingBillId}
            />
          ))}

          {unconfigured.length > 0 && configured.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <Separator className="flex-1" />
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Receipt className="size-3.5" />
                Cartões sem ciclo configurado
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          {unconfigured.map((card) => (
            <CardSection
              key={card.accountId}
              card={card}
              formatAmount={format}
              onMarkPaid={markBillAsPaid}
              payingBillId={payingBillId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
