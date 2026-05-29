"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ExternalLink,
  BarChart3,
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useApi } from "@/hooks/use-api";
import { formatPercent } from "@/lib/format";
import { useCurrency } from "@/lib/currency-context";
import { getCategoryEmoji, getCategoryColor } from "@/lib/category-emoji";
import { SankeyChart } from "@/components/charts/sankey-chart";
import { usePeriod } from "@/hooks/use-period";
import { PeriodSwitcher } from "@/components/period-switcher";
import { PageHeader } from "@/components/page-header";
import { PageError } from "@/components/page-error";

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

interface SpendingCategory {
  name: string;
  categoryId: string;
  amount: number;
  sharePercent: number;
  count: number;
}

interface SpendingResponse {
  summary: {
    total: number;
  };
  results: SpendingCategory[];
}

interface DomainCategory {
  id: string;
  name: string;
  parentId: string | null;
}

interface DomainCategoriesResponse {
  results: DomainCategory[];
}

type DisplayCategory = SpendingCategory;

const DAY_MS = 86_400_000;
const MIN_INCOME_FOR_SAVINGS_RATE = 1;

function parsePeriodDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function resolvePeriodRange(period: ReturnType<typeof usePeriod>) {
  const to = parsePeriodDate(period.to) ?? new Date();
  const fromParam = parsePeriodDate(period.from);

  if (fromParam) return { from: fromParam, to };

  switch (period.period) {
    case "30d":
      return { from: new Date(to.getTime() - 30 * DAY_MS), to };
    case "90d":
      return { from: new Date(to.getTime() - 90 * DAY_MS), to };
    case "180d":
      return { from: new Date(to.getTime() - 180 * DAY_MS), to };
    case "12m":
      return { from: new Date(to.getTime() - 365 * DAY_MS), to };
    case "ytd":
      return { from: new Date(Date.UTC(to.getUTCFullYear(), 0, 1)), to };
    case "mtd":
    default:
      return {
        from: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)),
        to,
      };
  }
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  tone?: "positive" | "negative" | "neutral" | "info";
}) {
  const toneClass = {
    positive: "text-emerald-400",
    negative: "text-rose-500",
    neutral: "text-foreground",
    info: "text-primary",
  }[tone];

  return (
    <div className="flex min-w-0 flex-col gap-1 border border-border p-4">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`break-words font-mono text-xl font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </p>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-[360px] lg:col-span-3" />
        <Skeleton className="h-[360px] lg:col-span-2" />
      </div>
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { format } = useCurrency();
  const period = usePeriod("mtd");

  const [showFuture, setShowFuture] = useState(
    searchParams.get("showFutureAccounts") !== "false",
  );
  const [detailed, setDetailed] = useState(
    searchParams.get("detailed") !== "false",
  );

  const updateParam = (key: string, value: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const apiParams = useMemo<Record<string, string>>(() => {
    return {
      ...period.params,
      showFutureAccounts: String(showFuture),
      ...(detailed ? { subcategories: "true" } : {}),
    };
  }, [period.params, detailed, showFuture]);

  const {
    data: overview,
    loading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useApi<OverviewResponse>("/api/domain/metrics/overview", apiParams);

  const {
    data: spending,
    loading: spendingLoading,
    error: spendingError,
    refetch: refetchSpending,
  } = useApi<SpendingResponse>(
    "/api/domain/metrics/spending/categories",
    apiParams,
  );

  // Fetch all categories for hierarchy support
  const { data: allCategoriesData } = useApi<DomainCategoriesResponse>(
    "/api/domain/categories",
    {
      pageSize: "500",
    },
  );

  const loading = overviewLoading || spendingLoading;
  const error = overviewError || spendingError;

  const sortedCategories = useMemo(() => {
    if (!spending?.results) return [];
    return [...spending.results].sort(
      (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
    );
  }, [spending]);

  // Compute aggregated categories (roll up to parent)
  const aggregatedCategories = useMemo(() => {
    if (!spending?.results || !allCategoriesData?.results) return [];

    // Build map of categoryId -> parentId
    const catParentMap = new Map<string, string | null>();
    allCategoriesData.results.forEach((cat) => {
      catParentMap.set(cat.id, cat.parentId);
    });

    // Build map of rootId -> aggregated amount & count
    const rootAmounts: Record<string, number> = {};
    const rootCounts: Record<string, number> = {};

    spending.results.forEach((item) => {
      let rootId = item.categoryId;
      let currentParent = catParentMap.get(item.categoryId);
      while (currentParent) {
        rootId = currentParent;
        currentParent = catParentMap.get(rootId);
      }
      rootAmounts[rootId] = (rootAmounts[rootId] || 0) + item.amount;
      rootCounts[rootId] = (rootCounts[rootId] || 0) + item.count;
    });

    // Get root category details (only those with aggregated amount)
    const rootCategories = allCategoriesData.results.filter(
      (cat) => !cat.parentId && rootAmounts[cat.id] !== undefined,
    );

    const total = rootCategories.reduce(
      (sum, cat) => sum + rootAmounts[cat.id],
      0,
    );

    const results = rootCategories
      .map((cat) => ({
        categoryId: cat.id,
        name: cat.name,
        amount: rootAmounts[cat.id],
        sharePercent: total > 0 ? (rootAmounts[cat.id] / total) * 100 : 0,
        count: rootCounts[cat.id] || 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return results;
  }, [spending, allCategoriesData]);

  const displayCategories = useMemo(() => {
    return detailed ? sortedCategories : aggregatedCategories;
  }, [detailed, sortedCategories, aggregatedCategories]);

  const categoryChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    displayCategories.forEach((cat, i) => {
      config[cat.name] = {
        label: cat.name,
        color: getCategoryColor(cat.name, i),
      };
    });
    return config;
  }, [displayCategories]);

  const pieData = useMemo(() => {
    return displayCategories.map((cat, i) => ({
      name: cat.name,
      value: Math.abs(cat.amount),
      fill: getCategoryColor(cat.name, i),
    }));
  }, [displayCategories]);

  if (error) {
    return (
      <PageError
        message="Erro ao carregar relatórios"
        refetch={() => {
          refetchOverview();
          refetchSpending();
        }}
      />
    );
  }

  const monthlyIncome = overview?.summary?.monthlyInflow ?? 0;
  const monthlyExpenses = Math.abs(overview?.summary?.monthlyOutflow ?? 0);
  const netResult = overview?.summary?.monthlyNet ?? 0;
  const expenseChange = overview?.summary?.expenseChange ?? null;
  const netChange = overview?.summary?.netChange ?? null;
  const totalSpending = spending?.summary?.total ?? 0;

  // Derived stats
  const savingsRate =
    monthlyIncome >= MIN_INCOME_FOR_SAVINGS_RATE
      ? (netResult / monthlyIncome) * 100
      : null;
  const { from: periodStart, to: periodEnd } = resolvePeriodRange(period);
  const daysInPeriod = Math.ceil(
    Math.max(periodEnd.getTime() - periodStart.getTime(), DAY_MS) / DAY_MS,
  );

  const dailyAvgSpend = monthlyExpenses / Math.max(daysInPeriod, 1);

  // Income/expense ratio
  const total = monthlyIncome + monthlyExpenses;
  const incomePercent = total > 0 ? (monthlyIncome / total) * 100 : 50;

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Análise detalhada de receitas, despesas e fluxo de caixa"
        actions={
          <div className="flex w-full max-w-full flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-3 border-border/60 sm:gap-4 sm:border-r sm:pr-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-future"
                  checked={showFuture}
                  onCheckedChange={(val) => {
                    setShowFuture(val);
                    updateParam("showFutureAccounts", val);
                  }}
                />
                <Label
                  htmlFor="show-future"
                  className="text-xs font-medium cursor-pointer"
                >
                  Parcelas
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="detailed"
                  checked={detailed}
                  onCheckedChange={(val) => {
                    setDetailed(val);
                    updateParam("detailed", val);
                  }}
                />
                <Label
                  htmlFor="detailed"
                  className="text-xs font-medium cursor-pointer"
                >
                  Subcategorias
                </Label>
              </div>
            </div>
            <PeriodSwitcher state={period} />
          </div>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Total Gasto"
          value={format(monthlyExpenses)}
          tone="negative"
          sub={
            expenseChange != null && (
              <span
                className={
                  expenseChange <= 0 ? "text-emerald-400" : "text-rose-500"
                }
              >
                {expenseChange <= 0 ? "↓" : "↑"}{" "}
                {formatPercent(Math.abs(expenseChange))} vs período ant.
              </span>
            )
          }
        />
        <StatCard
          label="Receita"
          value={format(monthlyIncome)}
          tone="positive"
        />
        <StatCard
          label="Resultado"
          value={format(netResult)}
          tone={netResult >= 0 ? "positive" : "negative"}
          sub={
            netChange != null && (
              <span
                className={
                  netChange >= 0 ? "text-emerald-400" : "text-rose-500"
                }
              >
                {netChange >= 0 ? "↑" : "↓"}{" "}
                {formatPercent(Math.abs(netChange))} vs mês ant.
              </span>
            )
          }
        />
        <StatCard
          label="Taxa de Poupança"
          value={savingsRate == null ? "N/D" : `${savingsRate.toFixed(1)}%`}
          tone={
            savingsRate == null
              ? "neutral"
              : savingsRate >= 20
                ? "positive"
                : savingsRate >= 0
                  ? "neutral"
                  : "negative"
          }
          sub={
            savingsRate == null ? (
              <span>Receita insuficiente para calcular</span>
            ) : (
              <span>~{format(dailyAvgSpend)}/dia em gastos</span>
            )
          }
        />
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Gastos por Categoria */}
        <Card className="lg:col-span-3 rounded-none border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Gastos por Categoria
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {displayCategories.length} cats
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <ChartContainer
                config={categoryChartConfig}
                className="aspect-square h-[180px] max-w-full shrink-0 sm:h-[200px]"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => format(value as number)}
                      />
                    }
                  />
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={0}
                    className="cursor-pointer"
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={getCategoryColor(entry.name, index)}
                        onClick={() => {
                          const cat = displayCategories.find(
                            (c) => c.name === entry.name,
                          );
                          if (cat?.categoryId) {
                            router.push(
                              `/transactions?categoryId=${cat.categoryId}&period=${period.period}`,
                            );
                          }
                        }}
                        className="outline-none hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>

              <div className="flex w-full flex-col gap-1.5">
                {displayCategories
                  .slice(0, 8)
                  .map((cat: DisplayCategory, i: number) => (
                    <button
                      key={cat.categoryId ?? cat.name}
                      onClick={() =>
                        router.push(
                          `/transactions?categoryId=${cat.categoryId}&period=${period.period}`,
                        )
                      }
                      className="flex items-center gap-2.5 py-1 hover:bg-muted/40 px-1 transition-colors group text-left w-full"
                    >
                      <div
                        className="size-2 shrink-0"
                        style={{
                          backgroundColor:
                            getCategoryColor(cat.name, i),
                        }}
                      />
                      <span className="flex-1 truncate text-xs font-mono">
                        {getCategoryEmoji(cat.name)} {cat.name}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">
                        {cat.sharePercent.toFixed(1)}%
                      </span>
                      <span className="text-xs font-mono tabular-nums font-medium">
                        {format(Math.abs(cat.amount))}
                      </span>
                      <ExternalLink className="size-2.5 opacity-0 group-hover:opacity-60 text-primary transition-opacity shrink-0" />
                    </button>
                  ))}
                {displayCategories.length > 8 && (
                  <p className="text-xs font-mono text-muted-foreground pl-4">
                    +{displayCategories.length - 8} outras categorias
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resultado Parcial */}
        <Card className="lg:col-span-2 rounded-none border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Resultado
              </CardTitle>
              <Link
                href="/cash-flow"
                className="font-mono text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1"
              >
                fluxo_caixa
                <ExternalLink className="size-2.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Net */}
            <div>
              <span
                className={`font-mono text-3xl font-bold tabular-nums ${
                  netResult >= 0 ? "text-emerald-400" : "text-rose-500"
                }`}
              >
                {format(netResult)}
              </span>
              {netChange != null && (
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium ${
                      netChange >= 0 ? "text-emerald-400" : "text-rose-500"
                    }`}
                  >
                    {netChange >= 0 ? (
                      <TrendingUp className="size-3" />
                    ) : (
                      <TrendingDown className="size-3" />
                    )}
                    {netChange >= 0 ? "+" : ""}
                    {formatPercent(Math.abs(netChange))}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    vs período anterior
                  </span>
                </div>
              )}
            </div>

            {/* Income/Expense bar — flat, no rounding */}
            <div className="flex h-2 w-full overflow-hidden">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${incomePercent}%` }}
              />
              <div
                className="bg-rose-500/70 transition-all"
                style={{ width: `${100 - incomePercent}%` }}
              />
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-border p-3">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">
                  Receita
                </p>
                <p className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                  {format(monthlyIncome)}
                </p>
              </div>
              <div className="border border-border p-3">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">
                  Gasto
                </p>
                <p className="font-mono text-sm font-bold tabular-nums text-rose-500">
                  {format(monthlyExpenses)}
                </p>
              </div>
              <div className="border border-border p-3">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">
                  Poupança
                </p>
                <p
                  className={`font-mono text-sm font-bold tabular-nums ${
                    savingsRate == null
                      ? "text-muted-foreground"
                      : savingsRate >= 0
                        ? "text-emerald-400"
                        : "text-rose-500"
                  }`}
                >
                  {savingsRate == null ? "N/D" : `${savingsRate.toFixed(1)}%`}
                </p>
              </div>
              <div className="border border-border p-3">
                <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">
                  Média/dia
                </p>
                <p className="font-mono text-sm font-bold tabular-nums">
                  {format(dailyAvgSpend)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sankey */}
      <Card className="rounded-none border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground uppercase flex items-center gap-2">
              <BarChart3 className="size-3" />
              Fluxo de Caixa
            </CardTitle>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              total gasto: {format(totalSpending)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="font-mono text-xs text-muted-foreground mb-3">
            Clique em uma categoria para ver as transações correspondentes
          </p>
          <SankeyChart
            data={{
              income: monthlyIncome,
              periodParam: period.period,
              categories: displayCategories.map((cat, i) => ({
                name: cat.name,
                total: Math.abs(cat.amount),
                color: getCategoryColor(cat.name, i),
                categoryId: cat.categoryId,
              })),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
