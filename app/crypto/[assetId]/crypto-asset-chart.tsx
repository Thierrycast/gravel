"use client"

import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export function CryptoAssetChart({ data }: { data: { date: string; price: number }[] }) {
  // Determine min and max for Y axis scaling
  const [min, max] = useMemo(() => {
    if (data.length === 0) return [0, 0]
    const prices = data.map(d => d.price)
    return [Math.min(...prices) * 0.95, Math.max(...prices) * 1.05]
  }, [data])

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="oklch(0.65 0.25 250)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="oklch(0.65 0.25 250)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
          <XAxis 
            dataKey="date" 
            tickFormatter={(val) => {
              const date = new Date(val)
              return `${date.getDate()}/${date.getMonth() + 1}`
            }}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            domain={[min, max]} 
            tickFormatter={(val) => `R$ ${val.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip 
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                    <div className="text-xs uppercase text-muted-foreground mb-1">
                      {label}
                    </div>
                    <div className="font-mono text-sm font-medium">
                      R$ {Number(payload[0].value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                )
              }
              return null
            }}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="oklch(0.65 0.25 250)" 
            fillOpacity={1} 
            fill="url(#colorPrice)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
