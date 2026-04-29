"use client"

import { useMemo } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Line } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useCurrency } from "@/lib/currency-context"
import { formatDate } from "@/lib/format"

interface NetWorthChartProps {
  history: Array<{
    date: string
    netWorth: number
    scenarioNetWorth?: number
    assets?: number | null
    liabilities?: number | null
  }>
  period: string
}

const chartConfig = {
  netWorth: {
    label: "Patrimônio",
    color: "oklch(0.70 0.20 150)",
  },
  scenarioNetWorth: {
    label: "Simulado",
    color: "oklch(0.85 0.15 200)",
  },
  assets: {
    label: "Ativos",
    color: "oklch(0.85 0.15 200)",
  },
  liabilities: {
    label: "Passivos",
    color: "oklch(0.60 0.25 25)",
  },
} satisfies ChartConfig

export function NetWorthChart({ history, period }: NetWorthChartProps) {
  const { format, formatCompact } = useCurrency()
  const filteredData = useMemo(() => {
    if (!history || history.length === 0) return []
    if (period === "ALL") return history

    const now = new Date()
    const monthsMap: Record<string, number> = {
      "1M": 1,
      "3M": 3,
      "6M": 6,
      "1Y": 12,
    }
    const months = monthsMap[period] ?? 12
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, now.getDate())

    return history.filter((d) => new Date(d.date) >= cutoff)
  }, [history, period])

  const hasAssetValuation = filteredData.some(
    (point) => point.assets != null || point.liabilities != null
  )

  return (
    <ChartContainer config={chartConfig} className="h-full w-full overflow-hidden">
      <AreaChart
        data={filteredData}
        margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
      >
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-netWorth)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-netWorth)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="oklch(0.25 0 0)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fontFamily: "monospace", fill: "oklch(0.55 0 0)" }}
          tickFormatter={(value) => {
            const date = new Date(value)
            return date.toLocaleDateString("pt-BR", { month: "short", day: "numeric" })
          }}
          minTickGap={30}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fontFamily: "monospace", fill: "oklch(0.55 0 0)" }}
          tickFormatter={(v) => formatCompact(v)}
          width={60}
          domain={[
            (dataMin: number) => dataMin - Math.abs(dataMin) * 0.25,
            (dataMax: number) => dataMax + Math.abs(dataMax) * 0.25,
          ]}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {chartConfig[String(name) as keyof typeof chartConfig]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {format(value as number)}
                  </span>
                </div>
              )}
              labelFormatter={(label) => formatDate(label)}
            />
          }
        />
        <Area
          dataKey="netWorth"
          type="linear"
          fill="url(#netWorthGradient)"
          stroke="var(--color-netWorth)"
          strokeWidth={2}
          isAnimationActive={false}
        />
        {filteredData.some(d => d.scenarioNetWorth != null) && (
          <Line
            dataKey="scenarioNetWorth"
            type="linear"
            stroke="var(--color-scenarioNetWorth)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
        )}
        {hasAssetValuation && (
          <>
            <Line
              type="linear"
              dataKey="assets"
              stroke="var(--color-assets)"
              strokeWidth={1.75}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="liabilities"
              stroke="var(--color-liabilities)"
              strokeWidth={1.75}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </>
        )}
      </AreaChart>
    </ChartContainer>
  )
}
