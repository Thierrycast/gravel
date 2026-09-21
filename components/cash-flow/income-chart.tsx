"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useCurrency } from "@/lib/currency-context";
import { ChangeBadge } from "./change-badge";
import type { CashFlowChartDatum } from "./types";

const incomeChartConfig: ChartConfig = {
  income: {
    label: "Receitas",
    color: "hsl(152 69% 53%)",
  },
};

/**
 * Card "Receitas": área mensal das entradas, com gradiente descendo até
 * transparente. É o único dos quatro que usa área em vez de barra — a leitura
 * aqui é de tendência acumulada, não de comparação mês a mês.
 *
 * Clicar em um mês chama `onMonthClick` com a data daquele ponto; quem decide
 * para onde isso leva é a página, não o gráfico.
 */
export function IncomeChart({
  data,
  total,
  change,
  onMonthClick,
}: {
  data: CashFlowChartDatum[];
  total: string;
  change: number | null | undefined;
  onMonthClick: (date: string) => void;
}) {
  const { format, formatCompact } = useCurrency();

  return (
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
          <ChangeBadge value={change} />
        </div>
        <CardTitle className="text-xl font-bold tabular-nums text-emerald-400">
          {total}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={incomeChartConfig}
          className="h-56 w-full cursor-pointer"
        >
          <AreaChart
            data={data}
            onClick={(d) => d?.activePayload?.[0]?.payload?.date && onMonthClick(d.activePayload[0].payload.date)}
          >
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
                fill: "var(--muted-foreground)",
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{
                fontSize: 11,
                fill: "var(--muted-foreground)",
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
  );
}
