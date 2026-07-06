"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

import { Lightbulb, ChevronDown, ChevronUp, Info, Shield } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ProjectionMonth {
  month: number;
  year: number;
  label: string;
  knownIncome?: number;
  estimatedSalary?: number;
  income: number;
  recurringExpenses: number;
  cardBills?: number;
  installments: number;
  variableExpenses: number;
  projected: number;
  balance: number;
  startingBalance?: number;
}

interface ProjectionSummary {
  averageMonthlyIncome: number;
  averageMonthlyExpenses: number;
  projectedSavings: number;
  currentBalance?: number;
  currentMonthAdjustment?: number;
  overdueStatements?: number;
  firstNegativeMonth?: string | null;
  goalCommitmentMonthly?: number;
  goalCommitmentCount?: number;
}

interface ProjectionData {
  months: ProjectionMonth[];
  summary: ProjectionSummary;
}

interface SettingsResponse {
  monthlySalary: number;
  effectiveMonthlySalary?: number;
  showFutureSalary: boolean;
}

interface MonteCarloSeries {
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface MonteCarloData {
  months: number;
  n: number;
  survivalRate: number;
  meanIncome: number;
  meanExpenses: number;
  series: MonteCarloSeries[];
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
  cardBills: {
    label: "Faturas de cart\u00e3o",
    color: "#ec4899",
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

const mcHorizons = [
  { label: "1 ano", value: "12" },
  { label: "3 anos", value: "36" },
  { label: "5 anos", value: "60" },
];

export default function ProjectionPage() {
  const { format, formatCompact } = useCurrency();
  const [months, setMonths] = useState("6");
  const [viewMode, setViewMode] = useState<"projecao" | "longo-prazo">("projecao");
  const [mcHorizon, setMcHorizon] = useState("60");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [salaryOverride, setSalaryOverride] = useState<boolean | null>(null);
  const [includeInstallments, setIncludeInstallments] = useState(true);
  const [includeVariableExpenses, setIncludeVariableExpenses] = useState(true);

  const { data: settings, loading: settingsLoading } =
    useApi<SettingsResponse>("/api/settings");
  const salaryAmount =
    settings?.effectiveMonthlySalary ?? settings?.monthlySalary ?? 0;
  const hasSalary = salaryAmount > 0;
  const includeSalary =
    hasSalary && (salaryOverride ?? settings?.showFutureSalary ?? false);

  const {
    data,
    loading: projectionLoading,
    error,
    refetch,
  } = useApi<ProjectionData>(
    settings ? "/api/projection" : null,
    {
      months,
      showFutureSalary: String(includeSalary),
      showFutureAccounts: String(includeInstallments),
      includeVariableExpenses: String(includeVariableExpenses),
    },
  );
  const { data: mcData, loading: mcLoading } = useApi<MonteCarloData>(
    viewMode === "longo-prazo" ? "/api/projection/montecarlo" : null,
    { months: mcHorizon },
  );

  const loading = settingsLoading || projectionLoading;
  const chartData = useMemo(
    () =>
      (data?.months ?? []).map((month) => ({
        ...month,
        recurringExpenses: -month.recurringExpenses,
        cardBills: -(month.cardBills ?? 0),
        installments: -month.installments,
        variableExpenses: -month.variableExpenses,
      })),
    [data],
  );
  const firstMonth = data?.months?.[0] ?? null;
  const lastMonth = data?.months?.at(-1) ?? null;
  const worstMonth =
    data?.months?.reduce<ProjectionMonth | null>(
      (worst, month) =>
        !worst || month.balance < worst.balance ? month : worst,
      null,
    ) ?? null;

  const insights = useMemo(() => {
    const monthsData = data?.months ?? [];
    const summary = data?.summary;
    if (monthsData.length === 0) return [];
    const result: {
      title: string;
      variant: "default" | "destructive" | "secondary";
    }[] = [];

    const installmentMonths = monthsData.filter(
      (month) => month.installments > 0,
    );
    if (
      installmentMonths.length > 0 &&
      installmentMonths.length < monthsData.length
    ) {
      result.push({
        title: `Parcelamentos terminam em ${installmentMonths.length} meses`,
        variant: "secondary",
      });
    }

    if (summary?.firstNegativeMonth) {
      result.push({
        title: `Saldo projetado fica negativo em ${summary.firstNegativeMonth}`,
        variant: "destructive",
      });
    }

    if ((summary?.overdueStatements ?? 0) > 0) {
      result.push({
        title: `Faturas vencidas somam ${format(summary?.overdueStatements ?? 0)}`,
        variant: "destructive",
      });
    }

    const overBudget = monthsData.filter(
      (month) =>
        month.recurringExpenses +
          (month.cardBills ?? 0) +
          month.installments +
          month.variableExpenses >
        month.income,
    );
    if (overBudget.length > 0) {
      const excess =
        overBudget[0].recurringExpenses +
        (overBudget[0].cardBills ?? 0) +
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

    const goalCommitment = summary?.goalCommitmentMonthly ?? 0;
    if (goalCommitment > 0 && monthsData.length > 0) {
      const avgNet =
        (summary?.averageMonthlyIncome ?? 0) -
        (summary?.averageMonthlyExpenses ?? 0);
      const goalCount = summary?.goalCommitmentCount ?? 0;
      if (avgNet < goalCommitment) {
        result.push({
          title: `Metas pedem ${format(goalCommitment)}/mês, mas a sobra média projetada é ${format(Math.max(avgNet, 0))}`,
          variant: "destructive",
        });
      } else {
        result.push({
          title: `Sobra projetada cobre os aportes de ${goalCount} meta(s) (${format(goalCommitment)}/mês)`,
          variant: "default",
        });
      }
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
    <div className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
      {/* Header */}
      <PageHeader
        title="Projeção de Saldo"
        description="Visualize o impacto das suas despesas recorrentes e parcelas no futuro."
        actions={
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setViewMode("projecao")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "projecao"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Projeção
              </button>
              <button
                onClick={() => setViewMode("longo-prazo")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${
                  viewMode === "longo-prazo"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Longo Prazo
              </button>
            </div>
            {/* Horizon selector */}
            {viewMode === "projecao" && (
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
            )}
            {viewMode === "longo-prazo" && (
              <div className="flex gap-0.5">
                {mcHorizons.map((h) => (
                  <button
                    key={h.value}
                    onClick={() => setMcHorizon(h.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mcHorizon === h.value
                        ? "bg-blue-500/20 text-blue-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {viewMode === "projecao" && <>
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-700 dark:text-sky-300">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-sky-600 dark:text-sky-400">
              Nota sobre o período
            </p>
            <p className="opacity-90">
              A projeção inicia sempre no <strong>mês seguinte</strong> ao atual.
              Salário estimado entra apenas como complemento quando não há uma
              receita recorrente ou transação futura de salário cobrindo o mês.
            </p>
            {(data?.summary.currentMonthAdjustment ?? 0) !== 0 && (
              <p className="opacity-90">
                Compromissos já conhecidos até o fim deste mês (fatura a vencer,
                lançamentos agendados) ajustam o saldo inicial em{" "}
                <strong>
                  {format(data?.summary.currentMonthAdjustment ?? 0)}
                </strong>
                .
              </p>
            )}
          </div>
        </div>
      </div>

      {(salaryOverride ?? settings?.showFutureSalary ?? false) && !hasSalary && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-amber-600 dark:text-amber-400">
                Salário não configurado
              </p>
              <p className="opacity-90">
                Você ativou a inclusão de salário, mas o valor configurado é R$
                0,00. Vá em <strong>Configurações</strong> para definir seu
                salário mensal líquido.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 sm:gap-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Switch
                  id="projection-salary"
                  checked={includeSalary}
                  disabled={!hasSalary}
                  onCheckedChange={
                    hasSalary ? setSalaryOverride : undefined
                  }
                />
                <Label
                  htmlFor="projection-salary"
                  className={`text-xs font-medium ${!hasSalary ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  Salário
                </Label>
              </div>
            </TooltipTrigger>
            {!hasSalary && (
              <TooltipContent side="top">
                Configure seu salário em Configurações para ativar
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
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
            Gastos variáveis
          </Label>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Próximo mês
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              (firstMonth?.projected ?? 0) >= 0
                ? "text-emerald-500"
                : "text-red-500"
            }`}
          >
            {format(firstMonth?.projected ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Saldo no fim do período
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              (lastMonth?.balance ?? 0) >= 0
                ? "text-blue-500"
                : "text-red-500"
            }`}
          >
            {format(lastMonth?.balance ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Menor saldo projetado
          </p>
          <p
            className={`mt-1 text-lg font-semibold tabular-nums ${
              (worstMonth?.balance ?? 0) >= 0
                ? "text-foreground"
                : "text-red-500"
            }`}
          >
            {format(worstMonth?.balance ?? 0)}
          </p>
        </div>
      </div>

      {/* Insight Cards */}
      {insights.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {insights.map((insight, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center gap-3 pt-4">
                <Lightbulb className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant={insight.variant} className="text-xs">
                    Insight
                  </Badge>
                  <span className="min-w-0 break-words text-sm">
                    {insight.title}
                  </span>
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
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Projeção Mensal</CardTitle>
          <CardDescription>
            Receitas, despesas e saldo projetado por mês.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="w-full max-w-full overflow-x-auto">
            <ChartContainer
              config={chartConfig}
              className="h-80 w-full min-w-0"
            >
              <ComposedChart data={chartData} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => {
                    const [year, month] = value.split("-");
                    const date = new Date(Number(year), Number(month) - 1, 1);
                    return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
                  }}
                />
                <YAxis
                  tickFormatter={(value) =>
                    !isFinite(value) ? "—" : formatCompact(Number(value))
                  }
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span>
                          {chartConfig[name as keyof typeof chartConfig]?.label}
                          :{" "}
                          {format(
                            name === "income" || name === "balance"
                              ? Number(value)
                              : Math.abs(Number(value)),
                          )}
                        </span>
                      )}
                    />
                  }
                />
                <ChartLegend
                  content={<ChartLegendContent />}
                  wrapperStyle={{ paddingTop: 8, flexWrap: "wrap", gap: 4 }}
                />
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="recurringExpenses"
                  stackId="outflow"
                  fill="var(--color-recurringExpenses)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="cardBills"
                  stackId="outflow"
                  fill="var(--color-cardBills)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="installments"
                  stackId="outflow"
                  fill="var(--color-installments)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="variableExpenses"
                  stackId="outflow"
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
          </div>
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
              const startingBalance =
                month.startingBalance ??
                (idx > 0
                  ? (data?.months?.[idx - 1]?.balance ?? 0)
                  : month.balance - month.projected);
              const projectedDelta = month.projected;
              const result = month.balance;

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
                          month.balance >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
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
                            <TableCell>Saldo inicial</TableCell>
                            <TableCell className="text-right font-medium">
                              {format(startingBalance)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Receitas conhecidas</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {format(month.knownIncome ?? month.income)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Receita estimada</TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {format(month.estimatedSalary ?? 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Recorrências</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {format(-month.recurringExpenses)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Faturas de cartão</TableCell>
                            <TableCell className="text-right font-medium text-red-500">
                              {format(-(month.cardBills ?? 0))}
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
                            <TableCell className="font-medium">
                              Variação projetada
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                projectedDelta >= 0
                                  ? "text-emerald-600"
                                  : "text-red-500"
                              }`}
                            >
                              {format(projectedDelta)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold">
                              Saldo final projetado
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
      </>}

      {/* Monte Carlo — Longo Prazo */}
      {viewMode === "longo-prazo" && (
        <div className="space-y-4">
          {mcLoading ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
              <Skeleton className="h-80" />
            </>
          ) : mcData ? (
            <>
              {/* Summary cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="flex items-center gap-4 pt-5">
                    <Shield className={`size-8 shrink-0 ${mcData.survivalRate >= 80 ? "text-emerald-400" : mcData.survivalRate >= 50 ? "text-amber-400" : "text-red-400"}`} />
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{mcData.survivalRate}%</p>
                      <p className="text-xs text-muted-foreground">Taxa de sobrevivência</p>
                      <p className="text-[11px] text-muted-foreground">% de cenários com saldo positivo</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-4 pt-5">
                    <div className="size-8 shrink-0 flex items-center justify-center rounded-full bg-emerald-500/10">
                      <span className="text-xs font-bold text-emerald-400">p50</span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{formatCompact(mcData.series.at(-1)?.p50 ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">Saldo mediano final</p>
                      <p className="text-[11px] text-muted-foreground">Cenário mais provável</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex items-center gap-4 pt-5">
                    <div className="size-8 shrink-0 flex items-center justify-center rounded-full bg-sky-500/10">
                      <span className="text-xs font-bold text-sky-400">N</span>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{mcData.n.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Simulações rodadas</p>
                      <p className="text-[11px] text-muted-foreground">{mcData.months} meses · Monte Carlo</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Fan chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribuição de Cenários</CardTitle>
                  <CardDescription>
                    Bandas de percentil p10–p90 para {mcData.months} meses. A linha central é a mediana (p50).
                    Quanto mais larga a banda, maior a incerteza.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      outer: { label: "p10–p90", color: "hsl(var(--chart-1))" },
                      inner: { label: "p25–p75", color: "hsl(var(--chart-1))" },
                      p50: { label: "Mediana", color: "hsl(var(--primary))" },
                    }}
                    className="h-80 w-full"
                  >
                    <AreaChart
                      data={mcData.series.map((s) => ({
                        label: s.label,
                        outerBase: s.p10,
                        outerBand: s.p90 - s.p10,
                        innerBase: s.p25,
                        innerBand: s.p75 - s.p25,
                        p50: s.p50,
                      }))}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.3)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        interval={Math.floor(mcData.series.length / 8)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => formatCompact(v)}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent formatter={(v) => formatCompact(Number(v))} />}
                      />
                      {/* Outer band base (transparent) */}
                      <Area
                        type="monotone"
                        dataKey="outerBase"
                        stackId="outer"
                        fill="transparent"
                        stroke="none"
                      />
                      {/* Outer band fill */}
                      <Area
                        type="monotone"
                        dataKey="outerBand"
                        stackId="outer"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.08}
                        stroke="none"
                      />
                      {/* Inner band base (transparent) */}
                      <Area
                        type="monotone"
                        dataKey="innerBase"
                        stackId="inner"
                        fill="transparent"
                        stroke="none"
                      />
                      {/* Inner band fill */}
                      <Area
                        type="monotone"
                        dataKey="innerBand"
                        stackId="inner"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.18}
                        stroke="none"
                      />
                      {/* Median line */}
                      <Line
                        type="monotone"
                        dataKey="p50"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <div className="rounded-xl border border-muted bg-muted/10 p-4 text-xs text-muted-foreground">
                <p>
                  Simulação com {mcData.n} trajetórias usando distribuição normal calibrada por {Math.ceil(mcData.months / 5)} meses de histórico
                  (renda média R$ {format(mcData.meanIncome)}/mês · despesas médias R$ {format(mcData.meanExpenses)}/mês).
                  Resultados são probabilísticos e não constituem previsão financeira.
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
