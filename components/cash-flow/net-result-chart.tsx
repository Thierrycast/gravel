"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
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

const netChartConfig: ChartConfig = {
  net: {
    label: "Resultado Liquido",
    color: "hsl(217 91% 60%)",
  },
};

/**
 * Card "Resultado Mensal": receitas menos despesas, mês a mês — o único gráfico
 * que cruza o zero, daí a `ReferenceLine` marcando a linha d'água.
 *
 * O `shape` customizado existe porque o Recharts desenha barra negativa com
 * `height` negativo, e o `radius` do `<Bar>` não sobrevive a isso: o retângulo
 * sai invertido e sem canto arredondado. Aqui normalizamos y/height na mão e
 * aproveitamos para pintar o mês no vermelho quando o saldo fica negativo.
 */
export function NetResultChart({
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
              Resultado Mensal
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Diferença entre receitas e despesas por mês</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <ChangeBadge value={change} />
        </div>
        <CardTitle className="text-xl font-bold tabular-nums text-blue-400">
          {total}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={netChartConfig} className="h-56 w-full cursor-pointer">
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
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickFormatter={formatCompact}
              width={48}
            />
            <ReferenceLine
              y={0}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => format(value as number)}
                />
              }
            />
            <Bar
              dataKey="net"
              radius={[6, 6, 0, 0]}
              fill="hsl(217 91% 60%)"
              shape={(props: unknown) => {
                const { x, y, width, height, payload } = props as {
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                  payload: CashFlowChartDatum;
                };
                const isNeg = payload.net < 0;
                const absHeight = Math.abs(height);
                const rectY = height < 0 ? y + height : y;
                return (
                  <rect
                    x={x}
                    y={rectY}
                    width={width}
                    height={absHeight}
                    rx={6}
                    fill={isNeg ? "hsl(0 72% 51%)" : "hsl(217 91% 60%)"}
                  />
                );
              }}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
