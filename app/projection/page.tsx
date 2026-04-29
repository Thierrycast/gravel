"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useCurrency } from "@/lib/currency-context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PageError } from "@/components/page-error";

interface ProjectionMonth {
  month: number;
  year: number;
  label: string;
  income: number;
  recurringExpenses: number;
  installments: number;
  variableExpenses: number;
  projected: number;
  balance: number;
}

interface ProjectionSummary {
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  projectedSavings: number;
}

interface ProjectionData {
  months: ProjectionMonth[];
  summary: ProjectionSummary;
}

const horizons = [
  { label: "3M", value: "3" },
  { label: "6M", value: "6" },
  { label: "12M", value: "12" },
];

const chartConfig: ChartConfig = {
  income: {
    label: "Receitas",
    color: "#10b981",
  },
  recurringExpenses: {
    label: "Recorr\u00eancias",
    color: "#f43f5e",
  },
  installments: {
    label: "Parcelas",
    color: "#f59e0b",
  },
  variableExpenses: {
    label: "Vari\u00e1vel",
    color: "#6b7280",
  },
  balance: {
    label: "Saldo Projetado",
    color: "#3b82f6",
  },
};

export default function ProjectionPage() {
  const { format } = useCurrency();
  const [months, setMonths] = useState("6");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [includeSalary, setIncludeSalary] = useState(true);
  const [includeInstallments, setIncludeInstallments] = useState(true);
  const [includeVariableExpenses, setIncludeVariableExpenses] = useState(true);

  const { data, loading, error, refetch } = useApi<ProjectionData>(
    "/api/projection",
    {
      months,
      showFutureSalary: String(includeSalary),
      showFutureAccounts: String(includeInstallments),
      includeVariableExpenses: String(includeVariableExpenses),
    },
  );

  const insights = useMemo(() => {
    const monthsData = data?.months ?? [];
    const summary = data?.summary;
    if (monthsData.length === 0) return [];
    const result: {
      title: string;
      variant: "default" | "destructive" | "secondary";
    }[] = [];

    const installmentMonths = monthsData.filter((month) => month.installments > 0);
    if (
      installmentMonths.length > 0 &&
      installmentMonths.length < monthsData.length
    ) {
      result.push({
        title: `Parcelamentos terminam em ${installmentMonths.length} meses`,
        variant: "secondary",
      });
    }

    const overBudget = monthsData.filter(
      (month) =>
        month.recurringExpenses + month.installments + month.variableExpenses > month.income,
    );
    if (overBudget.length > 0) {
      const excess =
        overBudget[0].recurringExpenses +
        overBudget[0].installments +
        overBudget[0].variableExpenses -
        overBudget[0].income;
      const rawPct =
        overBudget[0].income > 0
          ? Math.round((excess / overBudget[0].income) * 100)
          : null;
      const pct =
        rawPct != null && isFinite(rawPct) ? Math.min(rawPct, 9999) : null;
      result.push({
        title:
          pct == null
            ? `Despesas excedem receitas em ${overBudget.length} mês(es)`
            : `Despesas excedem receita por ${pct}% em ${overBudget.length} mês(es)`,
        variant: "destructive",
      });
    }

    if ((summary?.projectedSavings ?? 0) > 0) {
      result.push({
        title: `Economia projetada de ${format(summary?.projectedSavings ?? 0)} no período`,
        variant: "default",
      });
    }

    return result.slice(0, 3);
  }, [data, format]);

  if (error) {
    return <PageError message="Erro ao carregar projeções" refetch={refetch} />;
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Proje&ccedil;&atilde;o de Saldo
        </h1>
        <div className="flex gap-0.5">
          {horizons.map((h) => (
            <button
              key={h.value}
              onClick={() => setMonths(h.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                months === h.value
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Switch
            id="projection-salary"
            checked={includeSalary}
            onCheckedChange={setIncludeSalary}
          />
          <Label htmlFor="projection-salary" className="text-xs font-medium">
            Salário
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="projection-installments"
            checked={includeInstallments}
            onCheckedChange={setIncludeInstallments}
          />
          <Label
            htmlFor="projection-installments"
            className="text-xs font-medium"
          >
            Parcelas
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="projection-variable"
            checked={includeVariableExpenses}
            onCheckedChange={setIncludeVariableExpenses}
          />
          <Label htmlFor="projection-variable" className="text-xs font-medium">
            Subcategorias
          </Label>
        </div>
      </div>

      {/* Insight Cards */}
      {insights.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center gap-3 pt-4">
                <Lightbulb className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Badge variant={insight.variant} className="text-xs">
                    Insight
                  </Badge>
                  <span className="text-sm">{insight.title}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Receita M&eacute;dia Mensal
          </p>
          <p className="text-2xl font-bold tabular-nums text-emerald-400">
            {format(data?.summary.averageMonthlyIncome ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Despesa M&eacute;dia Mensal
          </p>
          <p className="text-2xl font-bold tabular-nums text-pink-400">
            {format(data?.summary.averageMonthlyExpenses ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
            Economia Projetada
          </p>
          <p className="text-2xl font-bold tabular-nums text-blue-400">
            {format(data?.summary.projectedSavings ?? 0)}
          </p>
        </div>
      </div>

      {/* Main Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projeção Mensal</CardTitle>
          <CardDescription>
            Receitas, despesas e saldo projetado por mês
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <ComposedChart data={data?.months ?? []} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(value) =>
                  !isFinite(value) ? "—" : `R$${(value / 1000).toFixed(0)}k`
                }
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>
                        {chartConfig[name as keyof typeof chartConfig]?.label}:{" "}
                        {format(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="income"
                fill="var(--color-income)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="recurringExpenses"
                fill="var(--color-recurringExpenses)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="installments"
                fill="var(--color-installments)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="variableExpenses"
                fill="var(--color-variableExpenses)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                dataKey="balance"
                type="monotone"
                stroke="var(--color-balance)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento Mensal</CardTitle>
          <CardDescription>
            Clique em um mês para expandir os detalhes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {(data?.months ?? []).map((month, idx) => {
              const isExpanded = expandedMonth === month.label;
              const prevBalance =
                idx > 0 ? (data?.months?.[idx - 1]?.balance ?? 0) : 0;
              const totalExpenses =
                month.recurringExpenses + month.installments + month.variableExpenses;
              const result = month.income - totalExpenses;

              return (
                <div key={month.label} className="rounded-lg border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      setExpandedMonth(isExpanded ? null : month.label)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{month.label}</span>
                      <Badge
                        variant={result >= 0 ? "default" : "destructive"}
                        className="text-xs"
                      >
                        {result >= 0 ? "Positivo" : "Negativo"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-sm font-semibold ${
                          month.balance >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {format(month.balance)}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t px-3 pb-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Componente</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Saldo Inicial</TableCell>
                            <TableCell className="text-right font-medium">
                              {format(prevBalance)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Receitas</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {format(month.income)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Recorrências</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {format(-month.recurringExpenses)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Parcelas</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {format(-month.installments)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Variável</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {format(-month.variableExpenses)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold">
                              Resultado
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                result >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {format(result)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
