"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { daysUntilLabel } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { LogoImage } from "@/components/logo-image";
import { getCategoryEmoji, getCategoryColor } from "@/lib/category-emoji";
import Link from "next/link";
import { ArrowRight, Repeat } from "lucide-react";

interface RecurringExpense {
  id: string;
  description: string;
  amount: number;
  frequency: string;
  category: string;
  nextDate: string;
  logoUrl?: string | null;
  merchantName?: string | null;
}

interface UpcomingExpensesProps {
  rules: RecurringExpense[] | null;
  totalMonthly: number | null;
  loading: boolean;
}

const frequencyLabels: Record<string, string> = {
  monthly: "Mensal",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  yearly: "Anual",
  daily: "Diário",
};

export function UpcomingExpenses({
  rules,
  totalMonthly,
  loading,
}: UpcomingExpensesProps) {
  const { format } = useCurrency();
  return (
    <Card className="col-span-full lg:col-span-1 rounded-none border-border h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-mono tracking-widest uppercase text-muted-foreground">
          Despesas Recorrentes
        </CardTitle>
        <CardDescription className="text-xs font-mono text-muted-foreground/60 uppercase">
          {totalMonthly != null
            ? `Total mensal: ${format(totalMonthly)}`
            : "Carregando..."}
        </CardDescription>
        <CardAction>
          <Link
            href="/recurring"
            className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
          >
            Ver mais
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
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
                  className="flex items-start justify-between gap-3 pb-3 border-b border-border/40 last:border-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0 flex items-start gap-3">
                    {expense.logoUrl ? (
                      <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-white p-1 flex items-center justify-center overflow-hidden mt-0.5 shadow-sm">
                        <LogoImage
                          src={expense.logoUrl}
                          alt={expense.description}
                          className="size-full object-contain"
                          fallback={getCategoryEmoji(expense.category || "")}
                        />
                      </div>
                    ) : (
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/50 text-base leading-none">
                        <span>
                          {getCategoryEmoji(expense.category || "")}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-none truncate">
                        {expense.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest px-1 border border-border/60 rounded-sm">
                          {expense.category}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Repeat className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-mono text-muted-foreground uppercase">
                            {frequencyLabels[expense.frequency.toLowerCase()] ??
                              expense.frequency}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground">
                            &middot; {daysUntilLabel(expense.nextDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap text-rose-500 mt-0.5">
                    {format(expense.amount)}
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
  );
}
