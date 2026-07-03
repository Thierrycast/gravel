"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import {
  Brain,
  Search,
  BarChart2,
  Zap,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle2,
  HeartPulse,
  Info,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useCurrency } from "@/lib/currency-context";
import { cn } from "@/lib/utils";
import type { InsightAction, InsightsResponse } from "@/lib/types/dashboard";

const chartConfig = {
  valor: {
    label: "Observado",
    color: "var(--primary)",
  },
  ideal: {
    label: "Esperado (Benford)",
    color: "var(--muted-foreground)",
  },
};

type ReportsHealth = {
  score: number;
  savingsRate: number;
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  cardDebt: number;
  cardDebtToIncome: number;
};

type ReportsResponse = {
  results?: {
    health?: ReportsHealth;
  };
};

const SEVERITY_STYLE: Record<
  InsightAction["severity"],
  { container: string; icon: typeof AlertTriangle; iconClass: string }
> = {
  critical: {
    container: "border-red-500/25 bg-red-500/5",
    icon: AlertTriangle,
    iconClass: "text-red-400",
  },
  warning: {
    container: "border-amber-500/25 bg-amber-500/5",
    icon: AlertTriangle,
    iconClass: "text-amber-400",
  },
  info: {
    container: "border-border bg-card",
    icon: Info,
    iconClass: "text-muted-foreground",
  },
};

function healthTone(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function healthLabel(score: number) {
  if (score >= 70) return "Saudável";
  if (score >= 40) return "Atenção";
  return "Crítico";
}

export default function InsightsPage() {
  const { format } = useCurrency();
  const { data: insights, loading } = useApi<InsightsResponse>("/api/insights");
  const { data: reports, loading: reportsLoading } = useApi<ReportsResponse>(
    "/api/domain/metrics/reports",
  );
  const [forensicsOpen, setForensicsOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const nudges = insights?.nudges ?? [];
  const warnings = nudges.filter((n) => n.type === "WARNING");
  const infos = nudges.filter((n) => n.type !== "WARNING");
  const actions = insights?.actions ?? [];
  const health = reports?.results?.health;

  const benfordData = insights?.forensics?.benford?.actual.map(
    (v: number | null, i: number) => ({
      digit: (i + 1).toString(),
      valor: parseFloat((v ?? 0).toFixed(1)),
      ideal: parseFloat(
        (insights?.forensics?.benford?.ideal[i] ?? 0).toFixed(1),
      ),
    }),
  );
  const hasBenfordData =
    benfordData?.some((point) => point.valor > 0 || point.ideal > 0) ?? false;

  const hiddenSubs = insights?.forensics?.hiddenSubs ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights"
        description="O que merece a sua atenção agora, gerado a partir de faturas, projeções e comportamento."
      />

      {/* Saúde financeira — hero */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {reportsLoading || !health ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-full border-4 border-current bg-background">
                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      healthTone(health.score),
                    )}
                  >
                    {health.score}
                  </span>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <HeartPulse
                      className={cn("size-4", healthTone(health.score))}
                    />
                    Saúde financeira: {healthLabel(health.score)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Poupança de {health.savingsRate.toFixed(0)}% da renda ·
                    dívida de cartão em {health.cardDebtToIncome.toFixed(0)}% da
                    renda mensal
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/reports">
                  Ver relatórios
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Ações recomendadas */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Ações recomendadas
          </h2>
        </div>
        {actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              Nada pendente: faturas em dia, projeção positiva e metas no
              ritmo.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {actions.map((action) => {
              const style = SEVERITY_STYLE[action.severity];
              const Icon = style.icon;
              return (
                <div
                  key={action.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
                    style.container,
                  )}
                >
                  <div className="flex gap-3">
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", style.iconClass)}
                    />
                    <div>
                      <p className="text-sm font-medium">{action.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {action.message}
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-auto"
                  >
                    <Link href={action.href}>
                      {action.hrefLabel}
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Warnings comportamentais */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-3">
          {warnings.map((nudge, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  {nudge.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {nudge.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nudges informativos */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Comportamento financeiro
          </h2>
        </div>
        {infos.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              Nenhum padrão de comportamento chamando atenção no momento.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {infos.map((nudge, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div>
                  <p className="text-sm font-medium">{nudge.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nudge.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assinaturas ocultas */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Search className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Assinaturas ocultas detectadas
          </h2>
        </div>
        <Card>
          <CardContent className="pt-5">
            {hiddenSubs.length === 0 ? (
              <div className="flex items-center gap-3 py-4">
                <Zap className="size-5 shrink-0 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma assinatura oculta detectada.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {hiddenSubs.map((sub, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-xs text-muted-foreground">
                        A cada {(sub.avgGap ?? 0).toFixed(0)} dias &middot;{" "}
                        {sub.occurrences}×
                      </p>
                    </div>
                    <p className="font-mono font-bold tabular-nums text-pink-400">
                      ~{format(sub.avgAmount ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              Transferências Pix enviadas e pagamentos de fatura são excluídos
              desta triagem.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Forense — Benford */}
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border bg-card px-5 py-4 transition-colors hover:bg-muted/30"
          onClick={() => setForensicsOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Análise Forense — Lei de Benford
            </span>
          </div>
          {forensicsOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>

        {forensicsOpen && (
          <Card className="mt-2 rounded-t-none border-t-0">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">
                Distribuição do primeiro dígito das suas transações vs. o ideal
                estatístico. Anomalias podem sugerir dados manipulados ou erros
                de importação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasBenfordData ? (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ComposedChart data={benfordData}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      strokeOpacity={0.1}
                    />
                    <XAxis
                      dataKey="digit"
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="valor"
                      fill="var(--color-valor)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="ideal"
                      stroke="var(--color-ideal)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "var(--color-ideal)" }}
                    />
                  </ComposedChart>
                </ChartContainer>
              ) : (
                <EmptyState
                  className="border-0 bg-transparent px-0 py-6"
                  title="Sem dados suficientes"
                  description="Dados insuficientes para exibir a análise de Benford."
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="pb-4 text-center text-xs text-muted-foreground/50">
        Os insights são gerados automaticamente com base em faturas, projeções
        e histórico de transações.
      </p>
    </div>
  );
}
