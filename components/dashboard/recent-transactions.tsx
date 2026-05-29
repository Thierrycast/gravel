"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { LogoImage } from "@/components/logo-image";
import { getCategoryEmoji } from "@/lib/category-emoji";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";


interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  direction?: string;
  category: string;
  categoryId?: string | null;
  accountName: string;
  accountImageUrl?: string | null;
  merchantName?: string | null;
  merchantLogoUrl?: string | null;
  displayTitle?: string;
  displaySubtitle?: string | null;
  isSalary?: boolean;
  isSelfTransfer?: boolean;
  transferFromAccountName?: string | null;
  transferFromAccountImageUrl?: string | null;
  transferToAccountName?: string | null;
  transferToAccountImageUrl?: string | null;
  linkedLend?: {
    id: string;
    friendName: string;
    status: string;
    role: "loan-outflow" | "payment-inflow";
  } | null;
}


interface RecentTransactionsProps {
  transactions: Transaction[] | null;
  loading: boolean;
}

function AccountLogo({
  name,
  imageUrl,
}: {
  name?: string | null;
  imageUrl?: string | null;
}) {
  const label = name || "Conta";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-white p-0.5 text-[10px] font-bold text-sky-700 shadow-sm">
      {imageUrl ? (
        <LogoImage
          src={imageUrl}
          alt={label}
          className="size-full object-contain"
          fallback={initials}
          fallbackClassName="text-[10px] text-sky-700"
        />
      ) : (
        initials
      )}
    </span>
  );
}

function TransferRouteLogo({ transaction }: { transaction: Transaction }) {
  const fromName = transaction.transferFromAccountName ?? transaction.accountName;
  const toName = transaction.transferToAccountName ?? "Destino";
  const hasRoute =
    Boolean(transaction.transferFromAccountName) ||
    Boolean(transaction.transferToAccountName);

  if (!hasRoute) {
    return (
      <div className="shrink-0 size-10 rounded-xl border border-sky-500/30 bg-sky-500/10 flex items-center justify-center shadow-sm text-xl">
        {getCategoryEmoji(transaction.category || "")}
      </div>
    );
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-sky-500/25 bg-sky-500/10 px-1.5 shadow-sm">
      <AccountLogo
        name={fromName}
        imageUrl={transaction.transferFromAccountImageUrl}
      />
      <ArrowRight className="size-3 text-sky-500" />
      <AccountLogo
        name={toName}
        imageUrl={transaction.transferToAccountImageUrl}
      />
    </div>
  );
}

export function RecentTransactions({
  transactions,
  loading,
}: RecentTransactionsProps) {
  const { format } = useCurrency();
  const grouped = useMemo(() => {
    if (!transactions) return [];
    // Limit to only the latest 5 transactions for the dashboard view
    const latestTxs = transactions.slice(0, 5);
    const map = new Map<string, Transaction[]>();
    for (const tx of latestTxs) {
      const dateKey = tx.date ? tx.date.split("T")[0] : "sem-data";
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(tx);
    }
    return Array.from(map.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
  }, [transactions]);

  return (
    <Card className="col-span-full lg:col-span-2 rounded-none border-border h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3 px-6">
        <CardTitle className="text-sm font-bold tracking-widest uppercase text-muted-foreground/80">
          Movimentações recentes
        </CardTitle>
        <CardAction>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            Ver mais
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 px-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([dateKey, txs]) => (
              <div key={dateKey}>
                <p className="text-xs font-mono font-bold text-muted-foreground/60 uppercase tracking-widest mb-3 border-b border-border/20 pb-1">
                  {dateKey === "sem-data" ? "SEM_DATA" : formatDate(dateKey)}
                </p>
                <div className="space-y-4">
                  {txs.map((tx) => {
                    const isSelfTransfer = Boolean(tx.isSelfTransfer);
                    const title =
                      tx.displayTitle || tx.merchantName || tx.description;
                    const subtitle =
                      tx.displaySubtitle ||
                      (isSelfTransfer
                        ? "Transferência entre minhas contas"
                        : tx.accountName);
                    const amountTone = isSelfTransfer
                      ? "text-sky-400"
                      : tx.direction === "INFLOW" || Number(tx.amount) > 0
                        ? "text-emerald-400"
                        : "text-rose-500";

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between gap-4 py-1"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          <span
                            className={`shrink-0 font-mono text-base font-black ${amountTone}`}
                          >
                            {isSelfTransfer
                              ? "↔"
                              : tx.direction === "INFLOW" || Number(tx.amount) > 0
                                ? "+"
                                : "−"}
                          </span>
                          <div className="flex items-center gap-3.5 min-w-0">
                            {isSelfTransfer ? (
                              <TransferRouteLogo transaction={tx} />
                            ) : tx.merchantLogoUrl ? (
                              <div className="shrink-0 size-10 rounded-xl border border-border/40 bg-white p-1.5 flex items-center justify-center shadow-sm overflow-hidden">
                                <LogoImage
                                  src={tx.merchantLogoUrl}
                                  alt={tx.merchantName || tx.description}
                                  className="size-full object-contain"
                                  fallback={getCategoryEmoji(tx.category || "")}
                                />
                              </div>
                            ) : (
                              <div className="shrink-0 size-10 rounded-xl border border-border/40 bg-muted/50 flex items-center justify-center shadow-sm text-xl">
                                {getCategoryEmoji(tx.category || "")}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <p
                                className="line-clamp-2 text-base font-semibold leading-tight text-foreground/90 sm:truncate"
                                title={title}
                              >
                                {title}
                              </p>
                              {(tx.isSalary || tx.linkedLend) && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {tx.isSalary ? (
                                    <Badge className="h-5 gap-1 bg-emerald-500/10 px-1.5 text-[10px] font-mono text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400">
                                      <BadgeDollarSign className="size-3" />
                                      Salário
                                    </Badge>
                                  ) : null}
                                  {tx.linkedLend ? (
                                    <Badge className="h-5 gap-1 bg-sky-500/10 px-1.5 text-[10px] font-mono text-sky-600 hover:bg-sky-500/10 dark:text-sky-400">
                                      <Users className="size-3" />
                                      Empréstimo
                                    </Badge>
                                  ) : null}
                                </div>
                              )}
                              <p
                                className="mt-0.5 truncate text-sm font-medium text-muted-foreground/70"
                                title={subtitle}
                              >
                                {subtitle}
                              </p>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-base font-mono font-bold tabular-nums whitespace-nowrap ${amountTone}`}
                        >
                          {format(Math.abs(Number(tx.amount)))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {(!transactions || transactions.length === 0) && (
              <p className="text-xs text-muted-foreground font-mono text-center py-4">
                {"// nenhuma_transação"}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
