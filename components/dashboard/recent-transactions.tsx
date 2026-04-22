"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, formatDate } from "@/lib/format"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

interface Transaction {
  id: string
  description: string
  amount: number
  date: string
  type: string
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
    <Card className="col-span-full lg:col-span-2">
      <CardHeader>
        <CardTitle>Transações Recentes</CardTitle>
        <CardAction>
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver todas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([dateKey, txs]) => (
              <div key={dateKey}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  {dateKey === "sem-data" ? "Sem data" : formatDate(dateKey)}
                </p>
                <div className="space-y-3">
                  {txs.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none truncate">
                          {tx.merchantName || tx.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {tx.category && (
                            <Badge variant="secondary" className="text-[10px]">
                              {tx.category}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {tx.accountName}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-sm font-medium tabular-nums whitespace-nowrap ${
                          tx.type === "INCOME" || tx.type === "CREDIT" || Number(tx.amount) > 0
                            ? "text-emerald-400"
                            : "text-pink-400"
                        }`}
                      >
                        {tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : ""}
                        {formatCurrency(Math.abs(Number(tx.amount)))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {(!transactions || transactions.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma transação encontrada
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
