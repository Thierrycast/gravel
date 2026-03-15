"use client"

import { Card, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, daysUntilLabel } from "@/lib/format"
import Link from "next/link"
import { ArrowRight, Repeat } from "lucide-react"

interface RecurringExpense {
  id: string
  description: string
  amount: number
  frequency: string
  category: string
  nextDate: string
}

interface UpcomingExpensesProps {
  rules: RecurringExpense[] | null
  totalMonthly: number | null
  loading: boolean
}

const frequencyLabels: Record<string, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  yearly: "Anual",
  daily: "Diário",
}

export function UpcomingExpenses({ rules, totalMonthly, loading }: UpcomingExpensesProps) {
  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle>Despesas Recorrentes</CardTitle>
        <CardDescription>
          {totalMonthly != null
            ? `Total mensal: ${formatCurrency(totalMonthly)}`
            : "Carregando..."}
        </CardDescription>
        <CardAction>
          <Link
            href="/recurring"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Ver mais
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {rules && rules.length > 0 ? (
              rules.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-start justify-between gap-3 pb-4 border-b last:border-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none truncate">
                      {expense.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {expense.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Repeat className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {frequencyLabels[expense.frequency] ?? expense.frequency}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        &middot; {daysUntilLabel(expense.nextDate)}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap text-red-500">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma despesa recorrente
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
