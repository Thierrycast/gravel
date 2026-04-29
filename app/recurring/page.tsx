"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Repeat, CreditCard, LayoutList } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { LogoImage } from "@/components/logo-image";
import { Skeleton } from "@/components/ui/skeleton";

import { type RecurringData } from "@/lib/types/api";

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
};


export default function RecurringPage() {
  const { format } = useCurrency();
  const year = new Date().getFullYear();

  const { data, loading } = useApi<RecurringData>("/api/recurring", {
    year: String(year),
  });

  const fixedExpenses = useMemo(
    () =>
      data?.rules.filter(
        (r) =>
          r.type === "EXPENSE" &&
          !r.isInstallment &&
          !/(\d+)\/(\d+)/.test(r.description),
      ) ?? [],
    [data],
  );

  const installmentItems = useMemo(
    () =>
      data?.rules.filter(
        (r) =>
          r.type === "EXPENSE" &&
          (r.isInstallment || /(\d+)\/(\d+)/.test(r.description)),
      ) ?? [],
    [data],
  );

  const fixedMonthly = fixedExpenses.reduce(
    (sum, r) => sum + Math.abs(Number(r.amount)),
    0,
  );
  const installmentMonthly = installmentItems.reduce(
    (sum, r) => sum + Math.abs(Number(r.amount)),
    0,
  );
  const totalMonthly = fixedMonthly + installmentMonthly;

  const categoryBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { count: number; total: number }>();
    for (const rule of data.rules.filter((r) => r.type === "EXPENSE")) {
      const cat = rule.category ?? "Outros";
      const prev = map.get(cat) ?? { count: 0, total: 0 };
      map.set(cat, {
        count: prev.count + 1,
        total: prev.total + Math.abs(Number(rule.amount)),
      });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, stats]) => ({ name, ...stats }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">
          Recorr&ecirc;ncias
        </h1>
        <div className="flex items-center gap-3">
          <Link
            href="/recurring/expenses"
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Ver despesas
          </Link>
          <Link
            href="/recurring/income"
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Ver receitas
          </Link>
        </div>
      </div>

      {/* Monthly summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Total mensal estimado
          </p>
          <p className="text-2xl font-bold tabular-nums text-pink-400">
            {format(totalMonthly)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.summary.count ?? 0} recorr&ecirc;ncias ativas
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Contas fixas
          </p>
          <p className="text-2xl font-bold tabular-nums text-blue-400">
            {format(fixedMonthly)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {fixedExpenses.length} item{fixedExpenses.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Parcelas
          </p>
          <p className="text-2xl font-bold tabular-nums text-amber-400">
            {format(installmentMonthly)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {installmentItems.length} item
            {installmentItems.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Two columns: Fixed & Installments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fixed expenses */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Repeat className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Parcelas</h3>
            <span className="text-xs text-muted-foreground">
              {installmentItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {installmentItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Nenhuma parcela encontrada.
              </p>
            )}
            {installmentItems.map((rule) => {
              const total =
                rule.totalInstallments ??
                (rule.occurrences > 0 ? rule.occurrences : 12);
              const current =
                rule.currentInstallment ??
                (rule.nextDate && rule.lastDate
                  ? Math.max(
                      0,
                      total -
                        Math.max(
                          1,
                          Math.ceil(
                            (new Date(rule.lastDate).getTime() -
                              new Date(rule.nextDate).getTime()) /
                              (1000 * 60 * 60 * 24 * 30),
                          ),
                        ),
                    )
                  : 0);
              const progressValue = total > 0 ? (current / total) * 100 : 0;

              return (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {rule.logoUrl ? (
                      <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/30 p-1 flex items-center justify-center overflow-hidden">
                        <LogoImage
                          src={rule.logoUrl}
                          alt={rule.description}
                          className="size-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/50 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase">
                          {rule.description.slice(0, 2)}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {rule.description}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-1 border border-border/60 rounded-[2px]">
                          {rule.category}
                        </span>
                        <div className="flex items-center gap-1.5 flex-1">
                          <div className="h-1.5 flex-1 max-w-24 rounded-full bg-muted/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {current}/{total}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-pink-400 ml-3">
                    {format(Math.abs(rule.amount))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contas fixas */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Contas Fixas</h3>
            <span className="text-xs text-muted-foreground">
              {fixedExpenses.length}
            </span>
          </div>
          <div className="space-y-2">
            {fixedExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">
                Nenhuma conta fixa encontrada.
              </p>
            )}
            {fixedExpenses.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {rule.logoUrl ? (
                    <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/30 p-1 flex items-center justify-center overflow-hidden">
                      <LogoImage
                        src={rule.logoUrl}
                        alt={rule.description}
                        className="size-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/50 flex items-center justify-center">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        {rule.description.slice(0, 2)}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {rule.description}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-1 border border-border/60 rounded-[2px]">
                        {rule.category}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        {frequencyLabel[rule.frequency] ?? rule.frequency}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-pink-400 ml-3">
                  {format(Math.abs(rule.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <LayoutList className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Resumo por categoria
            </h3>
          </div>
          <div className="space-y-2">
            {categoryBreakdown.map(({ name, count, total }) => {
              const pct = totalMonthly > 0 ? (total / totalMonthly) * 100 : 0;
              return (
                <div key={name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground truncate">
                        {name}
                      </span>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {count}×
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-pink-400">
                          {format(total)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pink-500/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
