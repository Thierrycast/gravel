"use client";

import { useState, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Info } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { formatPercent } from "@/lib/format";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "3M", months: "3" },
  { label: "6M", months: "6" },
  { label: "YTD", months: "12" },
  { label: "12M", months: "12" },
] satisfies Array<{ label: string; months: string }>;

const netChartConfig: ChartConfig = {
  net: {
    label: "Resultado Liquido",
    color: "hsl(217 91% 60%)",
  },
};

const expenseChartConfig: ChartConfig = {
  expense: {
    label: "Despesas",
    color: "hsl(330 81% 60%)",
  },
};

const investmentChartConfig: ChartConfig = {
  investments: {
    label: "Investimentos",
    color: "hsl(43 96% 56%)",
  },
};

const incomeChartConfig: ChartConfig = {
  income: {
    label: "Receitas",
    color: "hsl(152 69% 53%)",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMonth(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(date.getTime())) return "Sem data";
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

// ── Change Badge ─────────────────────────────────────────────────────────────

function ChangeBadge({
  value,
  invertColors = false,
}: {
  value: number | null | undefined;
  invertColors?: boolean;
}) {
  if (value == null) return null;

  const isPositive = invertColors ? value <= 0 : value >= 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <Icon className="size-3" />
      {formatPercent(Math.abs(value))}
    </span>
  );
}

// ── Loading ──────────────────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const { format, formatCompact } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState(PERIOD_OPTIONS[1]);

  const { data: cashFlow, loading: cashFlowLoading } = useApi<CashFlowResponse>(
    "/api/domain/metrics/cash-flow",
    {
      groupBy: "month",
      months: selectedPeriod.months,
    },
  );

  const { data: overview, loading: overviewLoading } = useApi<OverviewResponse>(
    "/api/domain/metrics/overview",
  );

  const loading = cashFlowLoading || overviewLoading;

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

  if (loading) return <LoadingSkeleton />;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            Fluxo de Caixa
          </h1>

          {/* Period pills */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-0.5">
            {PERIOD_OPTIONS.map((option) => {
              const active = option.label === selectedPeriod.label;
              return (
                <button
                  key={option.label}
                  onClick={() => setSelectedPeriod(option)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Receitas
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400">
                {format(totals.totalIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Despesas
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-pink-400">
                {format(totals.totalExpense)}
              </p>
            </div>
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
                Medio Mensal
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                {format(
                  chartData.length > 0 ? totals.totalNet / chartData.length : 0,
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Charts grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Receitas chart */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Receitas
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Evolução mensal das entradas de dinheiro</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <ChangeBadge value={overview?.summary?.incomeChange} />
              </div>
              <CardTitle className="text-xl font-bold tabular-nums text-emerald-400">
                {format(totals.totalIncome)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={incomeChartConfig}
                className="h-56 w-full"
              >
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="hsl(152 69% 53%)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(152 69% 53%)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/30"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={formatCompact}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(value as number)}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="hsl(152 69% 53%)"
                    strokeWidth={2}
                    fill="url(#incomeGrad)"
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Investimentos chart */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Investimentos
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Aportes para corretoras separados das despesas</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <CardTitle className="text-xl font-bold tabular-nums text-amber-400">
                {format(totals.totalInvestments)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={investmentChartConfig}
                className="h-56 w-full"
              >
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/30"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={formatCompact}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(value as number)}
                      />
                    }
                  />
                  <Bar
                    dataKey="investments"
                    fill="hsl(43 96% 56%)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Despesas chart */}
          <Card className="rounded-xl border bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Despesas
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Evolução mensal das saídas de dinheiro</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <ChangeBadge
                  value={overview?.summary?.expenseChange}
                  invertColors
                />
              </div>
              <CardTitle className="text-xl font-bold tabular-nums text-pink-400">
                {format(totals.totalExpense)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={expenseChartConfig}
                className="h-56 w-full"
              >
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/30"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={formatCompact}
                    width={48}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(value as number)}
                      />
                    }
                  />
                  <Bar
                    dataKey="expense"
                    fill="hsl(330 81% 60%)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Net Result over time */}
        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Resultado Mensal
              </p>
              <ChangeBadge value={overview?.summary?.netChange} />
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={netChartConfig}
              className="h-60 w-full"
            >
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted/30"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={formatCompact}
                  width={48}
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => format(value as number)}
                    />
                  }
                />
                <Bar
                  dataKey="net"
                  radius={[6, 6, 0, 0]}
                  fill="hsl(217 91% 60%)"
                  shape={(props: unknown) => {
                    const { x, y, width, height, payload } = props as {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                      payload: CashFlowItem;
                    };
                    const isNeg = payload.net < 0;
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        rx={6}
                        fill={isNeg ? "hsl(0 72% 51%)" : "hsl(217 91% 60%)"}
                      />
                    );
                  }}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Monthly breakdown table */}
        {chartData.length > 0 && (
          <div className="rounded-xl border bg-card">
            <div className="px-6 pt-5 pb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Detalhamento Mensal
              </p>
            </div>
            <div className="px-2 pb-2">
              {/* Table header */}
              <div className="grid grid-cols-5 gap-4 px-4 pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                <span>Mes</span>
                <span className="text-right">Receitas</span>
                <span className="text-right">Despesas</span>
                <span className="text-right">Investimentos</span>
                <span className="text-right">Resultado</span>
              </div>
              {/* Rows */}
              {[...chartData].reverse().map((item) => (
                <div
                  key={item.date}
                  className="grid grid-cols-5 gap-4 rounded-lg px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <span className="text-sm font-medium capitalize text-foreground">
                    {item.label}
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
