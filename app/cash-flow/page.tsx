"use client";

import { Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Info, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { usePeriod } from "@/hooks/use-period";
import { PeriodSwitcher } from "@/components/period-switcher";
import { PageHeader } from "@/components/page-header";
import { PageError } from "@/components/page-error";
import { ChangeBadge } from "@/components/cash-flow/change-badge";
import { IncomeChart } from "@/components/cash-flow/income-chart";
import { InvestmentsChart } from "@/components/cash-flow/investments-chart";
import { ExpenseChart } from "@/components/cash-flow/expense-chart";
import { NetResultChart } from "@/components/cash-flow/net-result-chart";


interface CashFlowItem {
  date: string;
  income: number;
  expense: number;
  investments: number;
  net: number;
}

interface CashFlowResponse {
  results: CashFlowItem[];
}

interface OverviewResponse {
  summary: {
    monthlyInflow: number;
    monthlyOutflow: number;
    monthlyNet: number;
    incomeChange: number | null;
    expenseChange: number | null;
    netChange: number | null;
  };
}


function formatMonth(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}


function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-[160px] w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[320px] w-full rounded-xl" />
        <Skeleton className="h-[320px] w-full rounded-xl" />
      </div>
    </div>
  );
}


function monthTransactionsHref(dateStr: string, direction?: "INFLOW" | "OUTFLOW") {
  const [year, month] = dateStr.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const params = new URLSearchParams({ period: "custom", from, to });
  if (direction) params.set("direction", direction);
  return `/transactions?${params.toString()}`;
}


/**
 * `usePeriod` consome `useSearchParams`. Sem uma fronteira de Suspense, o Next
 * tira a rota inteira do render estático e a hidratação parcial deixa de
 * funcionar. `app/transactions/page.tsx` já fazia assim; estas duas páginas
 * eram a exceção.
 */
export default function CashFlowPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <CashFlowContent />
    </Suspense>
  );
}

function CashFlowContent() {
  const { format } = useCurrency();
  // 6m, não 180d: a página agrupa por mês, e 180 dias atrás cai no meio de
  // março — sete barras num seletor que promete seis.
  const period = usePeriod("6m");
  const router = useRouter();

  const { data: cashFlow, loading: cashFlowLoading, error: cashFlowError, refetch: refetchCashFlow } = useApi<CashFlowResponse>(
    "/api/domain/metrics/cash-flow",
    {
      groupBy: "month",
      ...period.params,
    },
  );

  const { data: overview, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useApi<OverviewResponse>(
    "/api/domain/metrics/overview",
    period.params,
  );

  const loading = cashFlowLoading || overviewLoading;
  const error = cashFlowError || overviewError;

  const chartData = useMemo(() => {
    if (!cashFlow?.results) return [];
    return cashFlow.results.map((item) => ({
      ...item,
      label: formatMonth(item.date),
    }));
  }, [cashFlow]);

  const totals = useMemo(() => {
    if (!cashFlow?.results)
      return {
        totalIncome: 0,
        totalExpense: 0,
        totalInvestments: 0,
        totalNet: 0,
      };
    return cashFlow.results.reduce(
      (acc, item) => ({
        totalIncome: acc.totalIncome + item.income,
        totalExpense: acc.totalExpense + item.expense,
        totalInvestments: acc.totalInvestments + (item.investments ?? 0),
        totalNet: acc.totalNet + item.net,
      }),
      { totalIncome: 0, totalExpense: 0, totalInvestments: 0, totalNet: 0 },
    );
  }, [cashFlow]);

  if (error) {
    return (
      <PageError
        message="Erro ao carregar o fluxo de caixa."
        refetch={() => {
          refetchCashFlow();
          refetchOverview();
        }}
      />
    );
  }

  if (loading) return <LoadingSkeleton />;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Header row */}
        <PageHeader
          title="Fluxo de Caixa"
          actions={<PeriodSwitcher state={period} />}
        />

        {/* Hero: Resultado Liquido */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Resultado Liquido
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Receitas menos despesas no período selecionado</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span
              className={`text-3xl font-bold tabular-nums ${
                totals.totalNet >= 0 ? "text-blue-400" : "text-red-400"
              }`}
            >
              {format(totals.totalNet)}
            </span>
            <ChangeBadge value={overview?.summary?.netChange} />
          </div>

          {/* Summary row */}
          <div className="mt-4 flex flex-wrap gap-4 sm:gap-6 border-t border-border/50 pt-4">
            <Link
              href={`/transactions?${new URLSearchParams({ ...period.params, direction: "INFLOW" }).toString()}`}
              className="group cursor-pointer rounded-md p-1 -m-1 hover:bg-muted/30 transition-colors"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1">
                Receitas
                <ExternalLink className="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400">
                {format(totals.totalIncome)}
              </p>
            </Link>
            <Link
              href={`/transactions?${new URLSearchParams({ ...period.params, direction: "OUTFLOW" }).toString()}`}
              className="group cursor-pointer rounded-md p-1 -m-1 hover:bg-muted/30 transition-colors"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1">
                Despesas
                <ExternalLink className="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-pink-400">
                {format(totals.totalExpense)}
              </p>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Investimentos
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400">
                {format(totals.totalInvestments)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Médio Mensal
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                {format(
                  chartData.length > 0 ? totals.totalNet / chartData.length : 0,
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Charts grid — cada card mora em components/cash-flow; a página só
            decide o que entra e para onde o clique leva. */}
        <div className="grid gap-4 md:grid-cols-2">
          <IncomeChart
            data={chartData}
            total={format(totals.totalIncome)}
            change={overview?.summary?.incomeChange}
            onMonthClick={(date) =>
              router.push(monthTransactionsHref(date, "INFLOW"))
            }
          />

          <InvestmentsChart
            data={chartData}
            total={format(totals.totalInvestments)}
          />

          <ExpenseChart
            data={chartData}
            total={format(totals.totalExpense)}
            change={overview?.summary?.expenseChange}
            onMonthClick={(date) =>
              router.push(monthTransactionsHref(date, "OUTFLOW"))
            }
          />

          <NetResultChart
            data={chartData}
            total={format(totals.totalNet)}
            change={overview?.summary?.netChange}
            onMonthClick={(date) => router.push(monthTransactionsHref(date))}
          />
        </div>

        {/* Monthly breakdown table */}
        {chartData.length > 0 && (
          <div className="rounded-xl border bg-card">
            <div className="px-6 pt-5 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Detalhamento Mensal
              </p>
            </div>
            <div className="px-2 pb-2 overflow-x-auto">
              <div className="min-w-[600px]">
                {/* Table header */}
                <div className="grid grid-cols-5 gap-4 px-4 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  <span>Mes</span>
                  <span className="text-right">Receitas</span>
                  <span className="text-right">Despesas</span>
                  <span className="text-right">Investimentos</span>
                  <span className="text-right">Resultado</span>
                </div>
                {/* Rows — clicking each navigates to /transactions filtered by that month */}
                {[...chartData].reverse().map((item) => (
                  <Link
                    key={item.date}
                    href={monthTransactionsHref(item.date)}
                    className="group grid grid-cols-5 gap-4 rounded-lg px-4 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-1 text-sm font-medium capitalize text-foreground">
                      {item.label}
                      <ExternalLink className="size-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                    </span>
                    <span className="text-right text-sm tabular-nums text-emerald-400">
                      {format(item.income)}
                    </span>
                    <span className="text-right text-sm tabular-nums text-pink-400">
                      {format(item.expense)}
                    </span>
                    <span className="text-right text-sm tabular-nums text-amber-400">
                      {format(item.investments ?? 0)}
                    </span>
                    <span
                      className={`text-right text-sm font-medium tabular-nums ${
                        item.net >= 0 ? "text-blue-400" : "text-red-400"
                      }`}
                    >
                      {format(item.net)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
