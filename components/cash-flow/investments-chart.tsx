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
import type { CashFlowChartDatum } from "./types";

const investmentChartConfig: ChartConfig = {
  investments: {
    label: "Investimentos",
    color: "hsl(43 96% 56%)",
  },
};

/**
 * Card "Investimentos": barras mensais dos aportes, contabilizados à parte das
 * despesas para não inflar o gasto do mês.
 *
 * Diferente dos outros três, não tem clique nem selo de variação: não existe
 * filtro de "direção" em /transactions que isole aporte de despesa, então um
 * clique levaria o usuário a uma lista que não bate com a barra que ele viu.
 */
export function InvestmentsChart({
  data,
  total,
}: {
  data: CashFlowChartDatum[];
  total: string;
}) {
  const { format, formatCompact } = useCurrency();

  return (
    <Card className="rounded-xl border bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Investimentos
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Aportes para corretoras separados das despesas</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <CardTitle className="text-xl font-bold tabular-nums text-amber-400">
          {total}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={investmentChartConfig} className="h-56 w-full">
          <BarChart data={data} barCategoryGap="20%">
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
              dataKey="investments"
              fill="hsl(43 96% 56%)"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
