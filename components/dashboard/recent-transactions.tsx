"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"
import { useCurrency } from "@/lib/currency-context"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

interface Transaction {
  id: string
  description: string
  amount: number
  date: string
  direction?: string
  category: string
  categoryId?: string | null
  accountName: string
  accountImageUrl?: string | null
  merchantName?: string | null
}

interface RecentTransactionsProps {
  transactions: Transaction[] | null
  loading: boolean
}

export function RecentTransactions({ transactions, loading }: RecentTransactionsProps) {
  const { format } = useCurrency()
  const grouped = useMemo(() => {
    if (!transactions) return []
    // Limit to only the latest 5 transactions for the dashboard view
    const latestTxs = transactions.slice(0, 5)
    const map = new Map<string, Transaction[]>()
    for (const tx of latestTxs) {
      const dateKey = tx.date ? tx.date.split("T")[0] : "sem-data"
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(tx)
    }
    return Array.from(map.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    )
  }, [transactions])

  return (
    <Card className="col-span-full lg:col-span-2 rounded-none border-border h-full flex flex-col">
      <CardHeader className="pb-3 px-6">
        <CardTitle className="text-sm font-bold tracking-widest uppercase text-muted-foreground/80">Movimentações recentes</CardTitle>
        <CardAction>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline transition-all"
          >
            VER TODAS
            <ArrowRight className="h-4 w-4" />
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
                  {txs.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-4 py-1"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <span
                          className={`shrink-0 font-mono text-base font-black ${
                            tx.direction === "INFLOW" || Number(tx.amount) > 0
                              ? "text-emerald-400"
                              : "text-rose-500"
                          }`}
                        >
                          {tx.direction === "INFLOW" || Number(tx.amount) > 0 ? "+" : "−"}
                        </span>
                        <div className="flex items-center gap-3.5 min-w-0">
                          {tx.accountImageUrl ? (
                            <div className="shrink-0 size-10 rounded-xl border border-border/40 bg-muted/30 p-1.5 flex items-center justify-center shadow-sm overflow-hidden">
                              <img src={tx.accountImageUrl} alt={tx.accountName} className="size-full object-contain" />
                            </div>
                          ) : (
                            <div className="shrink-0 size-10 rounded-xl border border-border/40 bg-muted/50 flex items-center justify-center shadow-sm">
                              <span className="text-xs font-mono font-bold text-muted-foreground uppercase">{tx.accountName.slice(0, 2)}</span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-base font-semibold truncate leading-tight text-foreground/90">
                              {tx.merchantName || tx.description}
                            </p>
                            <p className="text-sm text-muted-foreground/70 font-medium truncate mt-0.5">
                              {tx.accountName}
                            </p>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-base font-mono font-bold tabular-nums whitespace-nowrap ${
                          tx.direction === "INFLOW" || Number(tx.amount) > 0
                            ? "text-emerald-400"
                            : "text-rose-500"
                        }`}
                      >
                        {format(Math.abs(Number(tx.amount)))}
                      </span>
                    </div>
                  ))}
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
  )
}
