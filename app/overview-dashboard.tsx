"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  Maximize2,
  X,
} from "lucide-react";

import {
  ComparisonChart,
  Pills,
  type ChartFilters,
  type CompareResponse,
} from "@/components/dashboard/comparison-chart";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { PeriodSwitcher } from "@/components/period-switcher";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApi } from "@/hooks/use-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCurrency } from "@/lib/currency-context";
import { usePeriod } from "@/hooks/use-period";
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses";
import type {
  InsightsResponse,
  OverviewDashboardData,
} from "@/lib/types/dashboard";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getCategoryEmoji, getCategoryColor } from "@/lib/category-emoji";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewMetricsResponse {
  results: {
    periodInflow: number;
    periodOutflow: number;
    fiatNetWorth: number;
    fiatAssets: number;
    investmentsTotal: number;
    counts: { investments: number };
  };
}

interface CategoriesResponse {
  results: Array<{
    categoryId: string | null;
    name: string;
    amount: number;
    sharePercent: number;
  }>;
}

interface CashFlowResponse {
  results: Array<{
    date: string;
    income: number;
    expense: number;
    investments: number;
    net: number;
  }>;
}

interface OverviewDashboardProps {
  initialData: OverviewDashboardData;
}

// ── Shared tooltip shell style ────────────────────────────────────────────────

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.35)",
  fontSize: 12,
  minWidth: 140,
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontWeight: 600,
  marginBottom: 6,
};

// ── CashFlow tooltip — colors match the bars/line ─────────────────────────────

const CASHFLOW_COLORS: Record<string, string> = {
  income:      "var(--chart-2)",  // emerald
  expense:     "var(--chart-4)",  // pink/red
  investments: "var(--chart-3)",  // amber
  net:         "#1d4ed8",         // Darker blue (blue-700)
};

const CASHFLOW_LABELS: Record<string, string> = {
  income:      "Entradas",
  expense:     "Saídas",
  investments: "Investimentos",
  net:         "Saldo",
};

interface RechartPayloadItem {
  dataKey: string;
  value: number;
  fill?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
}

function CashFlowTooltip({
  active,
  payload,
  label,
  format,
  subMode,
}: {
  active?: boolean;
  payload?: RechartPayloadItem[];
  label?: string;
  format: (v: number) => string;
  subMode: "all" | "inflow" | "outflow";
}) {
  if (!active) return null;

  // Always render all keys for the current sub-mode, even if value is 0
  const keys =
    subMode === "all"
      ? ["income", "expense", "investments", "net"]
      : subMode === "inflow"
        ? ["income"]
        : ["expense"];

  // Build value lookup from payload; default to 0 for absent keys
  const valueMap: Record<string, number> = {};
  for (const item of payload ?? []) valueMap[item.dataKey] = item.value;

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={TOOLTIP_LABEL_STYLE}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {keys.map((key) => {
          const color = CASHFLOW_COLORS[key] ?? "var(--foreground)";
          const name  = CASHFLOW_LABELS[key] ?? key;
          const value = valueMap[key] ?? 0;
          
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0, display: "inline-block" }} />
              <span style={{ color, flexGrow: 1 }}>{name}</span>
              <span style={{ color: "var(--foreground)", fontWeight: 600, fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>
                {format(Math.abs(value))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Categories (donut) tooltip — color matches the slice ─────────────────────

interface PiePayloadItem {
  fill?: string;
  value: number;
  name?: string;
  payload?: {
    name?: string;
    emoji?: string;
    share?: number;
    color?: string;
    fill?: string;
  };
}

function CategoryTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: PiePayloadItem[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item  = payload[0];
  const data  = item?.payload;
  const color = data?.color ?? data?.fill ?? item?.fill ?? "var(--foreground)";
  const name  = data?.name ?? item?.name ?? "";
  const emoji = data?.emoji ?? "";
  const share = data?.share;

  return (
    <div style={TOOLTIP_STYLE}>
      {/* Category label with color dot */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0, display: "inline-block" }} />
        <span style={{ color, fontWeight: 600 }}>
          {emoji ? `${emoji} ${name}` : name}
        </span>
      </div>
      {/* Value + share */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 17 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "var(--muted-foreground)" }}>Valor</span>
          <span style={{ color: "var(--foreground)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {format(item.value)}
          </span>
        </div>
        {share != null && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--muted-foreground)" }}>Fatia</span>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {share.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Default chart filters ─────────────────────────────────────────────────────

const DEFAULT_FILTERS: ChartFilters = {
  periodType: "month",
  metric: "expense",
  lineCount: 2,
  cumulative: true,
};

// ── Main component ─────────────────────────────────────────────────────────────

export function OverviewDashboard({ initialData }: OverviewDashboardProps) {
  const [mounted, setMounted] = useState(false);
  const periodState = usePeriod();
  const { format, formatCompact } = useCurrency();
  const [cashFlowSubMode, setCashFlowSubMode] = useState<"all" | "inflow" | "outflow">("all");
  const { data: insights } = useApi<InsightsResponse>("/api/insights");
  const {
    showSalary,
    setShowSalary,
    showFuture,
    setShowFuture,
    chartMode,
    setChartMode,
  } = useDashboardFilters();

  // ── Header & Period Switcher ──
  const [currentMonthLabel, setCurrentMonthLabel] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      setCurrentMonthLabel(new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
    }, 0);
    return () => clearTimeout(timer);
  }, []);


  // ── Lifted comparison chart state (shared with expand dialog) ──
  const [chartFilters, setChartFilters] = useState<ChartFilters>(DEFAULT_FILTERS);
  const [chartData, setChartData] = useState<CompareResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissedNudges, setDismissedNudges] = useState<number[]>([]);

  const fetchChartData = useCallback(() => {
    setChartLoading(true);
    fetch(
      `/api/domain/metrics/cash-flow/compare?periodType=${chartFilters.periodType}&count=${chartFilters.lineCount}`,
    )
      .then((r) => r.json())
      .then((d: CompareResponse) => setChartData(d))
      .catch(console.error)
      .finally(() => setChartLoading(false));
  }, [chartFilters.periodType, chartFilters.lineCount]);

  useEffect(() => {
    if (chartMode === "comparativo") {
      const timer = setTimeout(() => fetchChartData(), 0);
      return () => clearTimeout(timer);
    }
  }, [chartMode, fetchChartData]);

  function patchFilters(patch: Partial<ChartFilters>) {
    setChartFilters((prev) => ({ ...prev, ...patch }));
  }

  // ── Other API data ──
  const { data: overviewData } = useApi<OverviewMetricsResponse>(
    "/api/domain/metrics/overview",
    periodState.params,
  );
  const { data: categoriesData } = useApi<CategoriesResponse>(
    "/api/domain/metrics/spending/categories",
    { ...periodState.params, limit: "7" },
  );
  const { data: cashFlowData } = useApi<CashFlowResponse>(
    "/api/domain/metrics/cash-flow",
    { ...periodState.params, groupBy: "day" },
  );

  const { overview: initialOverview, transactions, recurring } = initialData;

  const overview = {
    ...initialOverview,
    inflow:  overviewData?.results?.periodInflow  ?? initialOverview.inflow,
    outflow: overviewData?.results?.periodOutflow ?? initialOverview.outflow,
  };
  const categories = {
    results: categoriesData?.results ?? initialData.categories.results,
  };
  const cashFlow = {
    results: (cashFlowData?.results ?? initialData.cashFlow.results).reduce((acc, day) => {
      const lastNet = acc.length > 0 ? acc[acc.length - 1].net : 0;
      const delta = day.income - day.expense - day.investments;
      acc.push({
        ...day,
        net: lastNet + delta
      });
      return acc;
    }, [] as CashFlowResponse["results"]),
  };



  const nudges = insights?.nudges ?? [];

  const dashboardChartModes = [
    { key: "comparativo" as const, label: "Comparativo" },
    { key: "cashFlow"    as const, label: "Fluxo" },
    { key: "categories"  as const, label: "Categorias" },
  ];

  // ── Pie chart data (categories donut) ──
  const pieData = categories.results.map((cat, i) => ({
    name: cat.name,
    value: cat.amount,
    share: cat.sharePercent,
    color: getCategoryColor(cat.name, i),
    emoji: getCategoryEmoji(cat.name),
  }));

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* AI Nudges */}
      {nudges.filter((_, i) => !dismissedNudges.includes(i)).length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nudges
            .map((nudge, i) => ({ nudge, i }))
            .filter(({ i }) => !dismissedNudges.includes(i))
            .map(({ nudge, i }) => (
              <Alert
                key={i}
                className="bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-4 duration-500 group relative"
              >
                {nudge.type === "WARNING" ? (
                  <AlertTriangle className="size-4 text-red-500" />
                ) : (
                  <Lightbulb className="size-4 text-amber-500" />
                )}
                <AlertTitle className="text-xs font-bold uppercase tracking-wider pr-6">
                  {nudge.title}
                </AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  {nudge.message}
                </AlertDescription>
                <button
                  onClick={() => setDismissedNudges((prev) => [...prev, i])}
                  className="absolute top-3 right-3 p-1 rounded-md hover:bg-primary/10 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-label="Dispensar alerta"
                >
                  <X className="size-3.5" />
                </button>
              </Alert>
            ))}
        </div>
      )}

      {/* Header & Period Switcher */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {periodState.label} • {currentMonthLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4 border-r pr-4 border-border/60">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center space-x-2">
                    <Switch id="show-salary" checked={showSalary} onCheckedChange={setShowSalary} aria-label="Mostrar salários" />
                    <Label htmlFor="show-salary" className="text-xs font-medium cursor-pointer">
                      Salários
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] text-center">
                  Inclui o salário configurado nas Entradas do período
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center space-x-2">
                    <Switch id="show-future" checked={showFuture} onCheckedChange={setShowFuture} aria-label="Mostrar parcelas" />
                    <Label htmlFor="show-future" className="text-xs font-medium cursor-pointer">
                      Parcelas
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-center">
                  Inclui parcelas de cartão de crédito nos totais de despesa
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <PeriodSwitcher state={periodState} />
        </div>
      </div>

      {/* KPI tiles */}
      <p className="sr-only">Resultado do período</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Patrimônio Líquido" value={format(overview.fiat.netWorth)}
          icon={Wallet} hint="Consolidado: Ativos - Passivos" tone="neutral" />
        <StatTile label="Entradas" value={format(overview.inflow)}
          icon={ArrowUpRight} tone="positive" hint="Incluindo salário configurado" />
        <StatTile label="Saídas" value={format(overview.outflow)}
          icon={ArrowDownLeft} tone="negative" hint="Total de gastos do período" />
        <StatTile label="Investimentos" value={format(overview.fiat.investments)}
          icon={TrendingUp} hint={`Total em ativos: ${format(overview.fiat.assets)}`} tone="neutral" />
      </div>

      {/* Charts & Category sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart panel */}
        <div className="surface flex flex-col gap-4 p-5 lg:col-span-2 overflow-hidden">
          {/* Chart header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: label + cashflow sub-mode */}
            <div className="flex items-center gap-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="size-3.5" /> Análise do período
              </h2>
              {chartMode === "cashFlow" && (
                <>
                  <div className="h-3 w-px bg-border/50" />
                  <Pills
                    size="xs"
                    options={[
                      { value: "all" as const,     label: "Completo" },
                      { value: "inflow" as const,  label: "Entradas"  },
                      { value: "outflow" as const, label: "Saídas"    },
                    ]}
                    value={cashFlowSubMode}
                    onChange={setCashFlowSubMode}
                  />
                </>
              )}
            </div>

            {/* Right: main tabs + expand */}
            <div className="flex items-center gap-2">
              <div className="flex overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {dashboardChartModes.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setChartMode(mode.key)}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                      chartMode === mode.key
                        ? "bg-background text-foreground shadow-sm dark:bg-card dark:shadow-none dark:ring-1 dark:ring-border/60"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Expand — available for all chart modes */}
              <button
                type="button"
                aria-label="Expandir gráfico"
                onClick={() => setExpanded(true)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Maximize2 className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Chart area */}
          <div className="h-[400px] w-full">
            {chartMode === "comparativo" && (
              <ComparisonChart
                filters={chartFilters}
                onFiltersChange={patchFilters}
                data={chartData}
                loading={chartLoading}
                onRefetch={fetchChartData}
              />
            )}

            {chartMode === "cashFlow" && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cashFlow.results}
                  margin={{ top: 16, right: 12, left: 0, bottom: 16 }}
                  barGap={2}
                  barCategoryGap="25%"
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                    tickFormatter={(value) => {
                      if (!value) return "";
                      const parts = String(value).split("T")[0].split("-");
                      if (parts.length === 3) {
                        const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                        return `${parts[2]}/${months[parseInt(parts[1], 10) - 1] ?? ""}`;
                      }
                      return String(value);
                    }}
                    minTickGap={28}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => formatCompact(Number(v))}
                    width={72}
                  />
                  <RechartsTooltip
                    content={(props) => (
                      <CashFlowTooltip
                        active={props.active}
                        payload={props.payload as RechartPayloadItem[] | undefined}
                        label={(() => {
                          const v = String(props.label ?? "");
                          const parts = v.split("T")[0].split("-");
                          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : v;
                        })()}
                        format={format}
                        subMode={cashFlowSubMode}
                      />
                    )}
                    cursor={{ fill: "var(--muted)", fillOpacity: 0.15 }}
                  />
                  <Line
                    key="line-investments"
                    name="Investimentos"
                    dataKey="investments"
                    stroke={CASHFLOW_COLORS.investments}
                    strokeWidth={1.5}
                    dot={{ r: 1.5, fill: CASHFLOW_COLORS.investments, strokeWidth: 0 }}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    type="monotone"
                    isAnimationActive={false}
                    yAxisId={0}
                  />
                  <Line
                    key="line-net"
                    name="Saldo"
                    dataKey="net"
                    stroke={CASHFLOW_COLORS.net}
                    strokeWidth={2}
                    dot={{ r: 2, fill: CASHFLOW_COLORS.net, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    type="monotone"
                    isAnimationActive={false}
                    yAxisId={0}
                  />
                  {(cashFlowSubMode === "all" || cashFlowSubMode === "inflow") && (
                    <Bar dataKey="income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} barSize={20} />
                  )}
                  {(cashFlowSubMode === "all" || cashFlowSubMode === "outflow") && (
                    <Bar dataKey="expense" fill="var(--chart-4)" radius={[4, 4, 0, 0]} barSize={20} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {/* Categories — donut chart (proportional, distinct from sidebar list) */}
            {chartMode === "categories" && pieData.length > 0 && (
              <div className="flex h-full items-center gap-4 overflow-hidden">
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="80%"
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} opacity={0.9} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={(props) => (
                        <CategoryTooltip
                          active={props.active}
                          payload={props.payload as PiePayloadItem[] | undefined}
                          format={format}
                        />
                      )}
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend — category list on the right */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1 text-xs">
                  {pieData.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="shrink-0 size-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate text-muted-foreground flex items-center gap-1">
                        <span aria-hidden>{cat.emoji}</span> {cat.name}
                      </span>
                      <span className="ml-auto shrink-0 tabular-nums font-medium">
                        {cat.share.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {chartMode === "categories" && pieData.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground">Sem dados de categorias.</p>
              </div>
            )}
          </div>
        </div>

        {/* Category sidebar — unchanged */}
        <div className="surface flex flex-col gap-5 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="size-3.5" /> Gastos por Categoria
          </h2>
          <div className="flex flex-col gap-3.5">
            {categories.results.map((cat, i) => {
              const color = getCategoryColor(cat.name, i);
              const emoji = getCategoryEmoji(cat.name);
              return (
                <div key={cat.categoryId} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate flex items-center gap-1.5">
                      <span
                        className="flex size-5 items-center justify-center rounded-full text-[10px] shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        {emoji}
                      </span>
                      {cat.name}
                    </span>
                    <span className="tabular-nums font-semibold shrink-0 ml-2">
                      {format(cat.amount)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${cat.sharePercent}%`, backgroundColor: color }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 text-right">
                    {cat.sharePercent.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Transactions & Recurring */}
      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-2 flex flex-col h-full min-w-0 overflow-hidden">
          <RecentTransactions transactions={transactions.results} loading={false} />
        </div>
        <div className="flex flex-col h-full min-w-0 overflow-hidden">
          <UpcomingExpenses
            rules={recurring.rules}
            totalMonthly={recurring.summary.totalMonthly}
            loading={false}
          />
        </div>
      </div>

      {/* ── Expand Dialog — renders whichever chart mode is currently active ── */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex flex-col gap-4 p-4 sm:p-6
          w-[calc(100vw-2rem)] max-w-5xl
          h-[calc(100dvh-4rem)] sm:h-[88vh]
          overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                {chartMode === "comparativo" ? "Análise comparativa"
                  : chartMode === "cashFlow" ? "Fluxo de caixa"
                  : "Categorias"}
              </span>
              {/* cashFlow sub-mode pills inside dialog */}
              {chartMode === "cashFlow" && (
                <Pills
                  size="xs"
                  options={[
                    { value: "all"     as const, label: "Completo" },
                    { value: "inflow"  as const, label: "Entradas" },
                    { value: "outflow" as const, label: "Saídas"   },
                  ]}
                  value={cashFlowSubMode}
                  onChange={setCashFlowSubMode}
                />
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-hidden">
            {chartMode === "comparativo" && (
              <ComparisonChart
                filters={chartFilters}
                onFiltersChange={patchFilters}
                data={chartData}
                loading={chartLoading}
                onRefetch={fetchChartData}
                expanded
              />
            )}

            {chartMode === "cashFlow" && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={cashFlow.results} 
                  margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
                  barGap={2}
                  barCategoryGap="25%"
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                    tickFormatter={(value) => {
                      const parts = String(value).split("T")[0].split("-");
                      if (parts.length === 3) {
                        const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                        return `${parts[2]}/${months[parseInt(parts[1], 10) - 1] ?? ""}`;
                      }
                      return String(value);
                    }}
                    minTickGap={28}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                    tickFormatter={(v) => formatCompact(Number(v))}
                    width={72}
                  />
                  <RechartsTooltip
                    content={(props) => (
                      <CashFlowTooltip
                        active={props.active}
                        payload={props.payload as RechartPayloadItem[] | undefined}
                        label={(() => {
                          const v = String(props.label ?? "");
                          const parts = v.split("T")[0].split("-");
                          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : v;
                        })()}
                        format={format}
                        subMode={cashFlowSubMode}
                      />
                    )}
                    cursor={{ fill: "var(--muted)", fillOpacity: 0.15 }}
                  />
                  <Line
                    key="line-investments"
                    name="Investimentos"
                    dataKey="investments"
                    stroke={CASHFLOW_COLORS.investments}
                    strokeWidth={1.5}
                    dot={{ r: 1.5, fill: CASHFLOW_COLORS.investments, strokeWidth: 0 }}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    type="monotone"
                    isAnimationActive={false}
                    yAxisId={0}
                  />
                  <Line
                    key="line-net"
                    name="Saldo"
                    dataKey="net"
                    stroke={CASHFLOW_COLORS.net}
                    strokeWidth={2}
                    dot={{ r: 2, fill: CASHFLOW_COLORS.net, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    type="monotone"
                    isAnimationActive={false}
                    yAxisId={0}
                  />
                  {(cashFlowSubMode === "all" || cashFlowSubMode === "inflow") && (
                    <Bar dataKey="income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} barSize={20} />
                  )}
                  {(cashFlowSubMode === "all" || cashFlowSubMode === "outflow") && (
                    <Bar dataKey="expense" fill="var(--chart-4)" radius={[4, 4, 0, 0]} barSize={20} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {chartMode === "categories" && pieData.length > 0 && (
              <div className="flex h-full items-center gap-6 overflow-hidden">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius="40%" outerRadius="76%" paddingAngle={2} isAnimationActive={false}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} opacity={0.9} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={(props) => (
                        <CategoryTooltip
                          active={props.active}
                          payload={props.payload as PiePayloadItem[] | undefined}
                          format={format}
                        />
                      )}
                      cursor={false}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  {pieData.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 size-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="truncate text-muted-foreground flex items-center gap-1.5">
                        <span aria-hidden>{cat.emoji}</span> {cat.name}
                      </span>
                      <span className="ml-auto shrink-0 tabular-nums font-medium">{format(cat.value)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground/70 w-12 text-right">{cat.share.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
