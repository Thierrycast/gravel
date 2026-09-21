"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
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

const expenseChartConfig: ChartConfig = {
  expense: {
    label: "Despesas",
    color: "hsl(330 81% 60%)",
  },
};

/**
 * Card "Despesas": barras mensais das saídas.
 *
 * O selo de variação vai com `invertColors` — num gráfico de gasto, crescer é
 * a notícia ruim, e pintar isso de verde diria o oposto do que o número quer
 * dizer.
 */
export function ExpenseChart({
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
              Despesas
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Evolução mensal das saídas de dinheiro</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <ChangeBadge value={change} invertColors />
        </div>
        <CardTitle className="text-xl font-bold tabular-nums text-pink-400">
          {total}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={expenseChartConfig}
          className="h-56 w-full cursor-pointer"
        >
          <BarChart
            data={data}
            barCategoryGap="20%"
            onClick={(d) => d?.activePayload?.[0]?.payload?.date && onMonthClick(d.activePayload[0].payload.date)}
          >
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
            <Bar
              dataKey="expense"
              fill="hsl(330 81% 60%)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
