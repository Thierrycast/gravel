"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Repeat, CreditCard, LayoutList } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { LogoImage } from "@/components/logo-image";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryEmoji } from "@/lib/category-emoji";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PageError } from "@/components/page-error";

import { type RecurringData } from "@/lib/types/api";

type MonthlyRecurringRule = RecurringData["rules"][number] & {
  dueInReferenceMonth?: boolean;
};

type MonthlyRecurringData = Omit<RecurringData, "rules" | "summary"> & {
  rules: MonthlyRecurringRule[];
  summary: RecurringData["summary"] & {
    fixedMonthlyExpenses?: number;
    installmentMonthlyExpenses?: number;
    referenceMonth?: string;
  };
};

const frequencyLabel: Record<string, string> = {
  MONTHLY: "Mensal",
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  YEARLY: "Anual",
  QUARTERLY: "Trimestral",
};


type SelectedRule = MonthlyRecurringRule & { _kind: "fixed" | "installment" };

export default function RecurringPage() {
  const { format } = useCurrency();
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const [selectedRule, setSelectedRule] = useState<SelectedRule | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, loading, error, refetch } = useApi<MonthlyRecurringData>("/api/recurring", {
    year: String(year),
    month: String(month),
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

  const fixedMonthly =
    data?.summary.fixedMonthlyExpenses ??
    fixedExpenses.reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const installmentMonthly =
    data?.summary.installmentMonthlyExpenses ??
    installmentItems.reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0);
  const totalMonthly =
    data?.summary.totalMonthlyExpenses ?? fixedMonthly + installmentMonthly;

  const categoryBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { count: number; total: number }>();
    for (const rule of data.rules.filter(
      (r) =>
        r.type === "EXPENSE" &&
        (!r.isInstallment || r.dueInReferenceMonth !== false),
    )) {
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

  if (error) {
    return <PageError message="Erro ao carregar recorrências" refetch={refetch} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        title="Recorrências"
        actions={
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
        }
      />

      {/* Monthly summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Total previsto no mês
          </p>
          <p className="text-2xl font-bold tabular-nums text-pink-400">
            {format(totalMonthly)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Fixas e parcelas com vencimento neste mês
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
            Parcelas no mês
          </p>
          <p className="text-2xl font-bold tabular-nums text-amber-400">
            {format(installmentMonthly)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Somente vencimentos do período
          </p>
        </div>
      </div>

      {/* Two columns: Fixed & Installments */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fixed expenses */}
        {/* min-w-0: sem isso o conteúdo (nomes longos + valores) alarga a
            coluna do grid além do viewport no mobile e a lista fica mais
            larga que os cards de resumo. */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Repeat className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Parcelas</h3>
            <span className="text-xs text-muted-foreground">
              {installmentItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {installmentItems.length === 0 && (
              <EmptyState
                variant="compact"
                icon={Repeat}
                title="Nenhuma parcela encontrada"
                description="Compras parceladas aparecerão aqui após a sincronização."
              />
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
                <button
                  key={rule.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => { setSelectedRule({ ...rule, _kind: "installment" }); setSheetOpen(true); }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {rule.logoUrl ? (
                      <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-white p-1 flex items-center justify-center overflow-hidden shadow-sm">
                        <LogoImage
                          src={rule.logoUrl}
                          alt={rule.description}
                          className="size-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/50 flex items-center justify-center text-lg">
                        {getCategoryEmoji(rule.category || "")}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {rule.description}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-1 border border-border/60 rounded-[2px] truncate max-w-[55%]">
                          {rule.category}
                        </span>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <div className="h-1.5 flex-1 max-w-24 rounded-full bg-muted/50 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                            {current}/{total}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-pink-400 ml-3">
                    {format(Math.abs(rule.amount))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contas fixas */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="font-semibold">Contas Fixas</h3>
            <span className="text-xs text-muted-foreground">
              {fixedExpenses.length}
            </span>
          </div>
          <div className="space-y-2">
            {fixedExpenses.length === 0 && (
              <EmptyState
                variant="compact"
                icon={CreditCard}
                title="Nenhuma conta fixa encontrada"
                description="Assinaturas e mensalidades fixas aparecerão aqui."
              />
            )}
            {fixedExpenses.map((rule) => (
              <button
                type="button"
                key={rule.id}
                className="flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => { setSelectedRule({ ...rule, _kind: "fixed" }); setSheetOpen(true); }}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                   {rule.logoUrl ? (
                    <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-white p-1 flex items-center justify-center overflow-hidden shadow-sm">
                      <LogoImage
                        src={rule.logoUrl}
                        alt={rule.description}
                        className="size-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="shrink-0 size-8 rounded-lg border border-border/40 bg-muted/50 flex items-center justify-center text-lg">
                      {getCategoryEmoji(rule.category || "")}
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {rule.description}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest px-1 border border-border/60 rounded-[2px] truncate max-w-[55%]">
                        {rule.category}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase truncate">
                        {frequencyLabel[rule.frequency] ?? rule.frequency}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-pink-400 ml-3">
                  {format(Math.abs(rule.amount))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recurring item detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedRule?.description}</SheetTitle>
            <SheetDescription>
              {selectedRule?._kind === "installment" ? "Parcela" : "Conta fixa"} •{" "}
              {frequencyLabel[selectedRule?.frequency ?? ""] ?? selectedRule?.frequency}
            </SheetDescription>
          </SheetHeader>
          {selectedRule && (
            <div className="flex flex-1 flex-col gap-0 overflow-y-auto px-4 pb-6">
              <div className="py-4 text-center">
                <p className="text-3xl font-bold tabular-nums text-pink-400">
                  {format(Math.abs(selectedRule.amount))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">por {frequencyLabel[selectedRule.frequency] ?? selectedRule.frequency}</p>
              </div>

              <Separator />

              <div className="space-y-3 py-4 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Informações</p>
                {selectedRule.category && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Categoria</span>
                    <span className="flex items-center gap-1.5 text-right font-medium">
                      {getCategoryEmoji(selectedRule.category)} {selectedRule.category}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Frequência</span>
                  <Badge variant="outline" className="text-xs">
                    {frequencyLabel[selectedRule.frequency] ?? selectedRule.frequency}
                  </Badge>
                </div>
                {selectedRule.nextDate && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Próxima</span>
                    <span>{formatDate(selectedRule.nextDate)}</span>
                  </div>
                )}
                {selectedRule.lastDate && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Última</span>
                    <span>{formatDate(selectedRule.lastDate)}</span>
                  </div>
                )}
                {selectedRule._kind === "installment" && (
                  <>
                    {selectedRule.currentInstallment != null && selectedRule.totalInstallments != null && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Parcela</span>
                        <span className="font-medium">
                          {selectedRule.currentInstallment}/{selectedRule.totalInstallments}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {selectedRule.occurrences > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Ocorrências detectadas</span>
                    <span>{selectedRule.occurrences}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <LayoutList className="size-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Resumo do mês por categoria
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
