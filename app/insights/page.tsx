"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import {
  Brain,
  Search,
  BarChart2,
  Zap,
  Loader2,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart as ReChartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";

type Nudge = {
  type: "WARNING" | "INFO" | string;
  title: string;
  message: string;
};

type HiddenSubscription = {
  name: string;
  avgGap: number;
  avgAmount: number;
  occurrences: number;
};

type InsightsResponse = {
  nudges?: Nudge[];
  forensics?: {
    benford?: {
      actual: number[];
      ideal: number[];
    };
    hiddenSubs?: HiddenSubscription[];
  };
};

const chartConfig = {
  valor: {
    label: "Seu Perfil",
    color: "hsl(var(--primary))",
  },
  ideal: {
    label: "Ideal",
    color: "hsl(var(--muted-foreground))",
  },
};

export default function InsightsPage() {
  const { data: insights, loading } = useApi<InsightsResponse>("/api/insights");
  const [forensicsOpen, setForensicsOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const nudges = insights?.nudges ?? [];
  const warnings = nudges.filter((n) => n.type === "WARNING");
  const infos = nudges.filter((n) => n.type !== "WARNING");

  const benfordData = insights?.forensics?.benford?.actual.map(
    (v: number, i: number) => ({
      digit: (i + 1).toString(),
      valor: parseFloat(v.toFixed(1)),
      ideal: parseFloat(
        (insights?.forensics?.benford?.ideal[i] ?? 0).toFixed(1),
      ),
    }),
  );

  const hiddenSubs = insights?.forensics?.hiddenSubs ?? [];

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Insights
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Análise automática do seu comportamento financeiro.
        </p>
      </div>

      {/* Warnings — prominent at top */}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-3">
          {warnings.map((nudge, i) => (
            <div
              key={i}
              className="flex gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4"
            >
              <AlertTriangle className="size-5 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  {nudge.title}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {nudge.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Behavioral nudges (INFO) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Comportamento financeiro
          </h2>
        </div>
        {infos.length === 0 && warnings.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
            <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Tudo calmo por aqui. Nenhum alerta comportamental no momento.
            </p>
          </div>
        )}
        {infos.length === 0 && warnings.length > 0 && (
          <div className="flex items-center gap-3 rounded-xl border bg-card p-5">
            <CheckCircle2 className="size-5 text-emerald-400 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Nenhum insight adicional além dos alertas acima.
            </p>
          </div>
        )}
        {infos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {infos.map((nudge, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-xl border bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <Lightbulb className="size-4 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{nudge.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {nudge.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden subscriptions — elevated */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Search className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Assinaturas ocultas detectadas
          </h2>
        </div>
        <Card>
          <CardContent className="pt-5">
            {hiddenSubs.length === 0 ? (
              <div className="flex items-center gap-3 py-4">
                <Zap className="size-5 text-muted-foreground/40 shrink-0" />
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
                        A cada {sub.avgGap.toFixed(0)} dias &middot;{" "}
                        {sub.occurrences}×
                      </p>
                    </div>
                    <p className="font-mono font-bold text-pink-400 tabular-nums">
                      ~R$ {sub.avgAmount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Forensics — collapsible advanced section */}
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border bg-card px-5 py-4 hover:bg-muted/30 transition-colors"
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
              {benfordData && benfordData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ReChartsBarChart data={benfordData}>
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
                    <Bar
                      dataKey="ideal"
                      fill="var(--color-ideal)"
                      radius={[4, 4, 0, 0]}
                      fillOpacity={0.3}
                    />
                  </ReChartsBarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Dados insuficientes para análise de Benford.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/50 text-center pb-4">
        Os insights são gerados automaticamente com base no histórico de
        transações.
      </p>
    </div>
  );
}
