"use client"

import { useMemo } from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Line } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCurrency, formatDate } from "@/lib/format"

interface NetWorthChartProps {
  history: Array<{
    date: string
    netWorth: number
    assets?: number | null
    liabilities?: number | null
  }>
  period: string
}

const chartConfig = {
  netWorth: {
    label: "Patrim\u00f4nio",
    color: "#10b981",
  },
  assets: {
    label: "Ativos",
    color: "#38bdf8",
  },
  liabilities: {
    label: "Passivos",
    color: "#f43f5e",
  },
} satisfies ChartConfig

export function NetWorthChart({ history, period }: NetWorthChartProps) {
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
    <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
      <AreaChart
        data={filteredData}
        margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-netWorth)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-netWorth)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatDate(v)}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCurrency(v)}
          width={90}
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
                    {formatCurrency(value as number)}
                  </span>
                </div>
              )}
              labelFormatter={(label) => formatDate(label)}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke="var(--color-netWorth)"
          strokeWidth={2}
          fill="url(#netWorthGradient)"
        />
        {hasAssetValuation && (
          <>
            <Line
              type="monotone"
              dataKey="assets"
              stroke="var(--color-assets)"
              strokeWidth={1.75}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="liabilities"
              stroke="var(--color-liabilities)"
              strokeWidth={1.75}
              dot={{ r: 3 }}
              connectNulls
            />
          </>
        )}
      </AreaChart>
    </ChartContainer>
  )
}
