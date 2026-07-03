"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  HeartPulse,
  Repeat,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReportsPayload = {
  results: {
    monthlyFlow: Array<{
      month: string;
      income: number;
      expenses: number;
      net: number;
    }>;
    spendingByAccount: Array<{
      accountId: string;
      name: string;
      kind: string;
      total: number;
    }>;
    topExpenses: Array<{
      description: string;
      amount: number;
      date: string;
      account: string | null;
      category: string | null;
    }>;
    categoryDeltas: Array<{
      category: string;
      current: number;
      previous: number;
      delta: number;
    }>;
    billsByMonth: Array<{ month: string; total: number }>;
    recurringSummary: {
      monthlyIncome: number;
      monthlyExpenses: number;
      incomeRules: number;
      expenseRules: number;
    };
    health: {
      score: number;
      savingsRate: number;
      avgMonthlyIncome: number;
      avgMonthlyExpenses: number;
      cardDebt: number;
      cardDebtToIncome: number;
      recurringCoverage: number | null;
    };
  };
};

const flowChartConfig: ChartConfig = {
  income: { label: "Receitas", color: "#10b981" },
  expenses: { label: "Despesas", color: "#f43f5e" },
  net: { label: "Resultado", color: "#3b82f6" },
};

const billsChartConfig: ChartConfig = {
  total: { label: "Fatura", color: "#ec4899" },
};

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "");
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground uppercase flex items-center gap-2">
      <Icon className="size-3" />
      {children}
    </CardTitle>
  );
}

function healthLabel(score: number) {
  if (score >= 75) return { label: "Saudável", className: "text-emerald-400" };
  if (score >= 50) return { label: "Atenção", className: "text-amber-400" };
  return { label: "Crítico", className: "text-red-400" };
}

export function ReportsInsightsSection() {
  const { format, formatCompact } = useCurrency();
  const { data, loading } = useApi<ReportsPayload>(
    "/api/domain/metrics/reports",
  );

  const results = data?.results;
  const flowData = useMemo(
    () =>
      (results?.monthlyFlow ?? []).map((item) => ({
        ...item,
        label: monthLabel(item.month),
        expenses: -item.expenses,
      })),
    [results],
  );
  const billsData = useMemo(() => {
    const nowKey = new Date().toISOString().slice(0, 7);
    return (results?.billsByMonth ?? [])
      .filter((item) => item.month <= addMonthsKey(nowKey, 6))
      .map((item) => ({
        ...item,
        label: monthLabel(item.month),
        isFuture: item.month > nowKey,
      }));
  }, [results]);

  const maxAccountTotal = Math.max(
    ...(results?.spendingByAccount ?? []).map((item) => item.total),
    1,
  );

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-none" />
        ))}
      </div>
    );
  }
  if (!results) return null;

  const health = healthLabel(results.health.score);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Receitas vs Despesas (12 meses) */}
        <Card className="lg:col-span-3 rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={Activity}>
              Receitas vs Despesas — 12 meses
            </SectionTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={flowChartConfig} className="h-64 w-full">
              <ComposedChart data={flowData} accessibilityLayer>
                <CartesianGrid vertical={false} strokeOpacity={0.1} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => formatCompact(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>
                          {flowChartConfig[name as keyof typeof flowChartConfig]
                            ?.label ?? name}
                          : {format(Math.abs(Number(value)))}
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="expenses"
                  fill="var(--color-expenses)"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  dataKey="net"
                  type="monotone"
                  stroke="var(--color-net)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Saúde financeira */}
        <Card className="lg:col-span-2 rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={HeartPulse}>Saúde financeira</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "font-mono text-4xl font-bold tabular-nums",
                  health.className,
                )}
              >
                {results.health.score}
              </span>
              <span className={cn("text-sm font-semibold", health.className)}>
                {health.label}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Taxa de poupança (3 meses)
                </span>
                <span
                  className={cn(
                    "font-mono font-semibold tabular-nums",
                    results.health.savingsRate >= 0
                      ? "text-emerald-400"
                      : "text-red-400",
                  )}
                >
                  {results.health.savingsRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Receita média/mês</span>
                <span className="font-mono tabular-nums">
                  {format(results.health.avgMonthlyIncome)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Despesa média/mês</span>
                <span className="font-mono tabular-nums">
                  {format(results.health.avgMonthlyExpenses)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Dívida em cartões
                </span>
                <span className="font-mono tabular-nums text-pink-400">
                  {format(results.health.cardDebt)} (
                  {results.health.cardDebtToIncome.toFixed(0)}% da renda)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Recorrências fixas/mês
                </span>
                <span className="font-mono tabular-nums">
                  {format(results.recurringSummary.monthlyExpenses)}
                </span>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Score combina taxa de poupança dos últimos 3 meses fechados e o
              peso da dívida de cartão sobre a renda média.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gastos por conta/cartão */}
        <Card className="rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={Wallet}>
              Gastos por conta e cartão — 12 meses
            </SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.spendingByAccount.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            )}
            {results.spendingByAccount.map((item) => (
              <Link
                key={item.accountId}
                href={`/transactions?accountId=${item.accountId}`}
                className="block space-y-1 group"
              >
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 truncate group-hover:text-primary">
                    {item.kind === "CARD" || item.kind === "CREDIT" ? (
                      <CreditCard className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <Wallet className="size-3 shrink-0 text-muted-foreground" />
                    )}
                    {item.name}
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {format(item.total)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{
                      width: `${(item.total / maxAccountTotal) * 100}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Faturas por mês */}
        <Card className="rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={CreditCard}>Faturas por mês</SectionTitle>
          </CardHeader>
          <CardContent>
            {billsData.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Configure o ciclo de fatura dos cartões em Configurações para
                ver este relatório.
              </p>
            ) : (
              <ChartContainer config={billsChartConfig} className="h-56 w-full">
                <ComposedChart data={billsData} accessibilityLayer>
                  <CartesianGrid vertical={false} strokeOpacity={0.1} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => (
                          <span>Fatura: {format(Number(value))}</span>
                        )}
                      />
                    }
                  />
                  <Bar
                    dataKey="total"
                    fill="var(--color-total)"
                    radius={[3, 3, 0, 0]}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Maiores gastos */}
        <Card className="rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={TrendingDown}>
              Maiores gastos — 90 dias
            </SectionTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {results.topExpenses.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            )}
            {results.topExpenses.slice(0, 8).map((item, index) => (
              <div
                key={`${item.description}-${item.date}-${index}`}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDate(item.date)}
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                </div>
                <span className="font-mono font-semibold tabular-nums shrink-0">
                  {format(item.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Variação mensal por categoria */}
        <Card className="rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={Activity}>
              Variação vs mês anterior
            </SectionTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {results.categoryDeltas.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sem variações relevantes entre os meses.
              </p>
            )}
            {results.categoryDeltas.map((item) => (
              <div
                key={item.category}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.category}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(item.previous)} → {format(item.current)}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-0.5 font-mono font-semibold tabular-nums",
                    item.delta > 0 ? "text-red-400" : "text-emerald-400",
                  )}
                >
                  {item.delta > 0 ? (
                    <ArrowUpRight className="size-3" />
                  ) : (
                    <ArrowDownRight className="size-3" />
                  )}
                  {format(Math.abs(item.delta))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recorrências */}
        <Card className="rounded-none border-border">
          <CardHeader className="pb-2">
            <SectionTitle icon={Repeat}>Recorrências mensais</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="size-3 text-emerald-400" />
                  Receitas recorrentes ({results.recurringSummary.incomeRules})
                </span>
                <span className="font-mono font-semibold tabular-nums text-emerald-400">
                  {format(results.recurringSummary.monthlyIncome)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingDown className="size-3 text-red-400" />
                  Despesas recorrentes ({results.recurringSummary.expenseRules})
                </span>
                <span className="font-mono font-semibold tabular-nums text-red-400">
                  {format(results.recurringSummary.monthlyExpenses)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Compromisso fixo líquido</span>
                <span
                  className={cn(
                    "font-mono font-bold tabular-nums",
                    results.recurringSummary.monthlyIncome -
                      results.recurringSummary.monthlyExpenses >=
                      0
                      ? "text-emerald-400"
                      : "text-red-400",
                  )}
                >
                  {format(
                    results.recurringSummary.monthlyIncome -
                      results.recurringSummary.monthlyExpenses,
                  )}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[10px] text-muted-foreground">
              <Link href="/recurring/income" className="hover:text-primary">
                → Gerenciar receitas recorrentes
              </Link>
              <Link href="/recurring/expenses" className="hover:text-primary">
                → Ver despesas recorrentes
              </Link>
              <Link href="/projection" className="hover:text-primary">
                → Previsão dos próximos meses (Projeções)
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function addMonthsKey(key: string, months: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
