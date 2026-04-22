"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCurrency } from "@/lib/format"

interface SpendingPaceChartProps {
  currentMonth: Array<{ day: number; cumulative: number }>
  previousMonth: Array<{ day: number; cumulative: number }>
}

const chartConfig = {
  current: {
    label: "M\u00eas atual",
    color: "#f43f5e",
  },
  previous: {
    label: "M\u00eas anterior",
    color: "#6b7280",
  },
} satisfies ChartConfig

export function SpendingPaceChart({
  currentMonth,
  previousMonth,
}: SpendingPaceChartProps) {
  const maxDay = Math.max(
    currentMonth.length > 0 ? currentMonth[currentMonth.length - 1].day : 0,
    previousMonth.length > 0 ? previousMonth[previousMonth.length - 1].day : 0,
    31
  )

  const data = Array.from({ length: maxDay }, (_, i) => {
    const day = i + 1
    const curr = currentMonth.find((d) => d.day === day)
    const prev = previousMonth.find((d) => d.day === day)
    return {
      day,
      current: curr?.cumulative ?? null,
      previous: prev?.cumulative ?? null,
    }
  })

  return (
    <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}`}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCurrency(v)}
          width={80}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                const label = name === "current" ? "Mês atual" : "Mês anterior"
                return (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatCurrency(value as number)}
                    </span>
                  </div>
                )
              }}
              labelFormatter={(label) => `Dia ${label}`}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="current"
          stroke="var(--color-current)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="previous"
          stroke="var(--color-previous)"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  )
}
