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
  categoryId?: string
  accountName: string
  merchantName?: string
}

interface RecentTransactionsProps {
  transactions: Transaction[] | null
  loading: boolean
}

export function RecentTransactions({ transactions, loading }: RecentTransactionsProps) {
  const { format } = useCurrency()
  const grouped = useMemo(() => {
    if (!transactions) return []
    const map = new Map<string, Transaction[]>()
    for (const tx of transactions) {
      const dateKey = tx.date ? tx.date.split("T")[0] : "sem-data"
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(tx)
    }
    return Array.from(map.entries()).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    )
  }, [transactions])

  return (
    <Card className="col-span-full lg:col-span-2 rounded-none border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-mono tracking-widest uppercase text-muted-foreground">Transações Recentes</CardTitle>
        <CardAction>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            ver_todas
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([dateKey, txs]) => (
              <div key={dateKey}>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">
                  {dateKey === "sem-data" ? "SEM_DATA" : formatDate(dateKey)}
                </p>
                <div className="space-y-1.5">
                  {txs.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 py-1 border-b border-border/40 last:border-0"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span
                          className={`shrink-0 font-mono text-xs font-bold ${
                            tx.direction === "INFLOW" || Number(tx.amount) > 0
                              ? "text-emerald-400"
                              : "text-rose-500"
                          }`}
                        >
                          {tx.direction === "INFLOW" || Number(tx.amount) > 0 ? "+" : "−"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm truncate">
                            {tx.merchantName || tx.description}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">
                            {tx.accountName}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-mono tabular-nums whitespace-nowrap ${
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
