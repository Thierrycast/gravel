"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useCurrency } from "@/lib/currency-context";

type ChartMode = "price" | "pnl" | "quantity" | "invested";
type ChartPeriod = "1M" | "3M" | "6M" | "1A" | "Tudo";

export type CryptoAssetChartPoint = {
  date: string;
  price: number;
  pnl: number;
  quantity: number;
  invested: number;
};

export type CryptoAssetOperationMarker = {
  id: string;
  date: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
};

const chartModes: Array<{ key: ChartMode; label: string }> = [
  { key: "price", label: "Preço" },
  { key: "pnl", label: "PnL" },
  { key: "quantity", label: "Quantidade" },
  { key: "invested", label: "Investido" },
];

const chartPeriods: Array<{ key: ChartPeriod; label: string; days: number | null }> = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "1A", label: "1A", days: 365 },
  { key: "Tudo", label: "Tudo", days: null },
];

function formatQuantity(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
}

export function CryptoCurrencyValue({
  value,
  fallback = "—",
}: {
  value: number | null | undefined;
  fallback?: string;
}) {
  const { format } = useCurrency();
  return <>{value == null ? fallback : format(value)}</>;
}

export function CryptoAssetChart({
  data,
  averagePrice,
  currentPrice,
  operations,
}: {
  data: CryptoAssetChartPoint[];
  averagePrice?: number | null;
  currentPrice?: number | null;
  operations: CryptoAssetOperationMarker[];
}) {
  const { format } = useCurrency();
  const [mode, setMode] = useState<ChartMode>("price");
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>("1A");
  const formatValue = useCallback(
    (selectedMode: ChartMode, value: number) =>
      selectedMode === "quantity" ? formatQuantity(value) : format(value),
    [format],
  );
  const markerData = useMemo(
    () =>
      operations.map((operation) => ({
        ...operation,
        operationPrice: operation.price,
      })),
    [operations],
  );

  const periodDays = chartPeriods.find((p) => p.key === selectedPeriod)?.days ?? null;

  const filteredData = useMemo(() => {
    if (periodDays === null) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return data.filter((point) => new Date(point.date) >= cutoff);
  }, [data, periodDays]);

  const filteredMarkerData = useMemo(() => {
    if (periodDays === null) return markerData;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return markerData.filter((op) => new Date(op.date) >= cutoff);
  }, [markerData, periodDays]);

  const [min, max] = useMemo(() => {
    const values = filteredData.map((point) => point[mode]).filter(Number.isFinite);
    if (mode === "price") {
      if (averagePrice != null) values.push(averagePrice);
      if (currentPrice != null) values.push(currentPrice);
    }
    if (values.length === 0) return [0, 0];
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = Math.max(
      Math.abs(maxValue - minValue) * 0.12,
      Math.abs(maxValue) * 0.04,
      1,
    );
    return [minValue - padding, maxValue + padding];
  }, [averagePrice, currentPrice, filteredData, mode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {chartModes.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === option.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {chartPeriods.map((period) => (
            <button
              key={period.key}
              type="button"
              onClick={() => setSelectedPeriod(period.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedPeriod === period.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={filteredData}
            margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="oklch(0.65 0.25 250)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="oklch(0.65 0.25 250)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              strokeOpacity={0.15}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getDate()}/${date.getMonth() + 1}`;
              }}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={[min, max]}
              tickFormatter={(value) => formatValue(mode, Number(value))}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const marker = payload.find(
                  (item) => item.dataKey === "operationPrice",
                )?.payload as CryptoAssetOperationMarker | undefined;
                return (
                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">
                      {new Date(label).toLocaleDateString("pt-BR")}
                    </div>
                    <div className="font-mono text-sm font-medium">
                      {formatValue(mode, Number(payload[0].value))}
                    </div>
                    {marker ? (
                      <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                        <div>{marker.type === "BUY" ? "Compra" : "Venda"}</div>
                        <div>Qtd. {formatQuantity(marker.quantity)}</div>
                        <div>Preço {format(marker.price)}</div>
                        <div>Total {format(marker.total)}</div>
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
            {mode === "price" && averagePrice != null && (
              <ReferenceLine
                y={averagePrice}
                stroke="oklch(0.75 0.17 65)"
                strokeDasharray="5 5"
                label={{
                  value: "Preço médio",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            )}
            {mode === "price" && currentPrice != null && (
              <ReferenceLine
                y={currentPrice}
                stroke="oklch(0.72 0.18 150)"
                strokeDasharray="3 3"
                label={{
                  value: "Atual",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey={mode}
              stroke="oklch(0.65 0.25 250)"
              fill="url(#colorMetric)"
              fillOpacity={1}
              strokeWidth={2}
              isAnimationActive={false}
            />
            {mode === "price" && filteredMarkerData.length > 0 && (
              <Scatter
                data={filteredMarkerData}
                dataKey="operationPrice"
                isAnimationActive={false}
                shape={(props: unknown) => {
                  const { cx, cy, payload } = props as {
                    cx: number;
                    cy: number;
                    payload: CryptoAssetOperationMarker;
                  };
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={
                        payload.type === "BUY"
                          ? "oklch(0.72 0.18 150)"
                          : "oklch(0.64 0.22 25)"
                      }
                      stroke="var(--background)"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
