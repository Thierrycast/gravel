"use client";

import {
  BarChart3,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";

import dynamic from "next/dynamic";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatTile } from "@/components/dashboard/stat-tile";
import { ChartSkeleton } from "@/components/dashboard/skeleton-chart";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { PeriodSwitcher } from "@/components/period-switcher";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCurrency } from "@/lib/currency-context";
import { usePeriod } from "@/hooks/use-period";
import { UpcomingExpenses } from "@/components/dashboard/upcoming-expenses";

const NetWorthChart = dynamic(
  () =>
    import("@/components/dashboard/net-worth-chart").then(
      (mod) => mod.NetWorthChart,
    ),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

type OverviewDashboardData = {
  overview: {
    fiat: {
      netWorth: number;
      assets: number;
      investments: number;
    };
    inflow: number;
    outflow: number;
    counts: {
      investments: number;
    };
  };
  categories: {
    results: Array<{
      categoryId: string | null;
      name: string;
      amount: number;
      sharePercent: number;
    }>;
  };
  netWorth: {
    points: Array<{
      date: string;
      netWorth: number;
      scenarioNetWorth?: number;
      assets?: number | null;
      liabilities?: number | null;
    }>;
  };
  cashFlow: {
    results: Array<{
      date: string;
      income: number;
      expense: number;
      investments: number;
      net: number;
    }>;
  };
  transactions: {
    results: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      direction?: string;
      category: string;
      categoryId?: string | null;
      accountName: string;
      merchantName?: string | null;
    }>;
  };
  recurring: {
    rules: Array<{
      id: string;
      description: string;
      amount: number;
      frequency: string;
      category: string;
      nextDate: string;
    }>;
    summary: {
      totalMonthly: number;
    };
  };
};

interface OverviewDashboardProps {
  initialData: OverviewDashboardData;
}

type Nudge = {
  type: "WARNING" | "INFO" | string;
  title: string;
  message: string;
};

type InsightsResponse = {
  nudges?: Nudge[];
};

export function OverviewDashboard({ initialData }: OverviewDashboardProps) {
  const periodState = usePeriod();
  const { format, formatCompact } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: insights } = useApi<InsightsResponse>("/api/insights");

  const [showSalary, setShowSalary] = useState(
    searchParams.get("showFutureSalary") !== "false",
  );
  const [showFuture, setShowFuture] = useState(
    searchParams.get("showFutureAccounts") !== "false",
  );
  const [chartMode, setChartMode] = useState<
    "netWorth" | "cashFlow" | "categories"
  >("netWorth");

  const updateParam = (key: string, value: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const { overview, categories, netWorth, cashFlow, transactions, recurring } =
    initialData;
  const nudges = insights?.nudges ?? [];
  const dashboardChartModes = [
    { key: "netWorth" as const, label: "Patrimônio" },
    { key: "cashFlow" as const, label: "Fluxo líquido" },
    { key: "categories" as const, label: "Categorias" },
  ];

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* AI Nudges */}
      {nudges.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {nudges.map((nudge, i) => (
            <Alert
              key={i}
              className="bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-top-4 duration-500"
            >
              {nudge.type === "WARNING" ? (
                <AlertTriangle className="size-4 text-red-500" />
              ) : (
                <Lightbulb className="size-4 text-amber-500" />
              )}
              <AlertTitle className="text-xs font-bold uppercase tracking-wider">
                {nudge.title}
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                {nudge.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Header & Period Switcher */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Painel financeiro
          </h1>
          <p className="text-sm text-muted-foreground">
            {periodState.label} •{" "}
            {new Date().toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-4 border-r pr-6 border-border/60">
            <div className="flex items-center space-x-2">
              <Switch
                id="show-salary"
                checked={showSalary}
                onCheckedChange={(val) => {
                  setShowSalary(val);
                  updateParam("showFutureSalary", val);
                }}
              />
              <Label
                htmlFor="show-salary"
                className="text-xs font-medium cursor-pointer"
              >
                Salários
              </Label>
            </div>
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
          </div>
          <PeriodSwitcher state={periodState} />
        </div>
      </div>

      {/* Main Stats Grid */}
      <p className="sr-only">Resultado do período</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Patrimônio Líquido"
          value={format(overview.fiat.netWorth)}
          icon={Wallet}
          hint={`Total em ativos: ${format(overview.fiat.assets)}`}
          tone="neutral"
        />
        <StatTile
          label="Entradas"
          value={format(overview.inflow)}
          icon={ArrowUpRight}
          tone="positive"
        />
        <StatTile
          label="Saídas"
          value={format(overview.outflow)}
          icon={ArrowDownLeft}
          tone="negative"
        />
        <StatTile
          label="Investimentos"
          value={format(overview.fiat.investments)}
          icon={TrendingUp}
          hint={`${overview.counts.investments} ativos tradicionais`}
          tone="info"
        />
      </div>

      {/* Charts & Secondary Analysis */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface flex flex-col gap-6 p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="size-4" /> Análise do período
            </h2>
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {dashboardChartModes.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setChartMode(mode.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    chartMode === mode.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-80 w-full">
            {chartMode === "netWorth" && (
              <NetWorthChart
                history={netWorth.points}
                period={periodState.period === "all" ? "ALL" : "1Y"}
              />
            )}
            {chartMode === "cashFlow" && (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cashFlow.results}
                  margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="oklch(0.25 0 0)"
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "oklch(0.55 0 0)",
                    }}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                      })
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{
                      fontSize: 10,
                      fontFamily: "monospace",
                      fill: "oklch(0.55 0 0)",
                    }}
                    tickFormatter={(value) => formatCompact(Number(value))}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      format(Number(value)),
                      name === "income"
                        ? "Entradas"
                        : name === "expense"
                          ? "Saídas"
                          : name === "investments"
                            ? "Investimentos"
                            : "Saldo",
                    ]}
                    labelFormatter={(value) =>
                      new Date(String(value)).toLocaleDateString("pt-BR")
                    }
                  />
                  <Bar
                    dataKey="income"
                    fill="oklch(0.72 0.18 150)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    fill="oklch(0.64 0.22 25)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="investments"
                    fill="oklch(0.78 0.16 75)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    dataKey="net"
                    stroke="oklch(0.70 0.20 250)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            {chartMode === "categories" && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categories.results}
                  layout="vertical"
                  margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="3 3"
                    stroke="oklch(0.25 0 0)"
                  />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => format(Number(value))}
                  />
                  <Bar
                    dataKey="amount"
                    fill="var(--primary)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="surface flex flex-col gap-6 p-6">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="size-4" /> Gastos por Categoria
          </h2>
          <div className="flex flex-col gap-4">
            {categories.results.map((cat) => (
              <div key={cat.categoryId} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{cat.name}</span>
                  <span className="tabular-nums font-semibold">
                    {format(cat.amount)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full bg-primary/80"
                    style={{ width: `${cat.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transactions & Bills */}
      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-2 flex flex-col h-full">
          <RecentTransactions
            transactions={transactions.results}
            loading={false}
          />
        </div>
        <div className="flex flex-col h-full">
          <UpcomingExpenses
            rules={recurring.rules}
            totalMonthly={recurring.summary.totalMonthly}
            loading={false}
          />
        </div>
      </div>
    </div>
  );
}
