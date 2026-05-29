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
import { EmptyState } from "@/components/ui/empty-state";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { InsightsResponse } from "@/lib/types/dashboard";

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
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
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
                        A cada {(sub.avgGap ?? 0).toFixed(0)} dias &middot;{" "}
                        {sub.occurrences}×
                      </p>
                    </div>
                    <p className="font-mono font-bold text-pink-400 tabular-nums">
                      ~R$ {(sub.avgAmount ?? 0).toFixed(2)}
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

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/50 text-center pb-4">
        Os insights são gerados automaticamente com base no histórico de
        transações.
      </p>
    </div>
  );
}
