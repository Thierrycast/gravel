"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RechartsTooltip,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useCurrency } from "@/lib/currency-context";


export type PeriodType = "month" | "quarter" | "semester" | "year";
export type Metric = "expense" | "income" | "net";

export interface ChartFilters {
  periodType: PeriodType;
  metric: Metric;
  lineCount: number;
  cumulative: boolean;
}

export interface CmpPoint {
  x: number;
  xLabel: string;
  net: number;
  income: number;
  expense: number;
  cumNet: number;
  cumIncome: number;
  cumExpense: number;
}

export interface CmpPeriod {
  label: string;
  from: string;
  to: string;
  points: CmpPoint[];
}

export interface CompareResponse {
  periods: CmpPeriod[];
  periodType: PeriodType;
}

interface ComparisonChartProps {
  filters: ChartFilters;
  onFiltersChange: (f: Partial<ChartFilters>) => void;
  data: CompareResponse | null;
  loading: boolean;
  onRefetch: () => void;
  /** When true, chart gets extra height (expand dialog mode) */
  expanded?: boolean;
}

// Hues ~90° apart on the color wheel — distinct on dark, no same-color shades.
export const PERIOD_PALETTE: readonly string[] = [
  "hsl(217 91% 60%)",  // blue   — slot 0 (atual)
  "hsl(0   78% 60%)",  // red    — slot 1
  "hsl(48  95% 55%)",  // yellow — slot 2
  "hsl(142 65% 48%)",  // green  — slot 3
];

// Opacity in the fill distinguishes current period (stronger) from previous ones.
const AREA_FILL_OPACITY = [0.22, 0.14, 0.10, 0.07] as const;


export const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "month",    label: "Mês" },
  { value: "quarter",  label: "Trim." },
  { value: "semester", label: "Sem." },
  { value: "year",     label: "Ano" },
];

export const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "expense", label: "Gastos" },
  { value: "income",  label: "Receitas" },
  { value: "net",     label: "Saldo" },
];


function getNiceTicks(min: number, max: number): number[] {
  const range = max - min;
  if (range <= 0) return [min, min + 1];

  const targetTickCount = 8;
  const rawStep = range / (targetTickCount - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const magDigit = rawStep / mag;

  let step: number;
  if (magDigit <= 1.2) step = 1 * mag;
  else if (magDigit <= 2.2) step = 2 * mag;
  else if (magDigit <= 3) step = 2.5 * mag;
  else if (magDigit <= 7) step = 5 * mag;
  else step = 10 * mag;

  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  
  for (let val = start; val <= max + step * 0.001; val += step) {
    ticks.push(Number(val.toFixed(2)));
  }

  // Ensure breathing room: exactly two ticks above max
  let lastTick = ticks[ticks.length - 1];
  while (lastTick < max + step * 1.5) {
    lastTick = Number((lastTick + step).toFixed(2));
    ticks.push(lastTick);
  }

  // Ensure at least one tick below min if it's the only one
  if (ticks.length < 2) {
    ticks.unshift(Number((ticks[0] - step).toFixed(2)));
  }

  return ticks;
}

function metricKey(metric: Metric, cumulative: boolean): keyof CmpPoint {
  if (cumulative) {
    if (metric === "expense") return "cumExpense";
    if (metric === "income")  return "cumIncome";
    return "cumNet";
  }
  return metric;
}

function mergeIntoChartData(
  periods: CmpPeriod[],
  metric: Metric,
  cumulative: boolean,
): Record<string, number | string>[] {
  if (periods.length === 0) return [];

  const allX = new Set<number>();
  for (const p of periods) for (const pt of p.points) allX.add(pt.x);

  const labelMap = new Map<number, string>();
  for (const p of periods)
    for (const pt of p.points)
      if (!labelMap.has(pt.x)) labelMap.set(pt.x, pt.xLabel);

  const key = metricKey(metric, cumulative);
  const sortedX = Array.from(allX).sort((a, b) => a - b);
  
  // Track last known values for cumulative padding
  const lastValues = new Array(periods.length).fill(null);

  return sortedX.map((x) => {
    const row: Record<string, number | string> = {
      x,
      xLabel: labelMap.get(x) ?? String(x),
    };
    for (let i = 0; i < periods.length; i++) {
      const pt = periods[i].points.find((p) => p.x === x);
      if (pt != null) {
        const val = pt[key] as number;
        row[`p${i}`] = val;
        lastValues[i] = val;
      } else {
        row[`p${i}`] = cumulative ? (lastValues[i] ?? 0) : 0;
      }
    }
    return row;
  });
}

function buildChartConfig(periods: CmpPeriod[]): ChartConfig {
  const config: ChartConfig = {};
  for (let i = 0; i < periods.length; i++) {
    config[`p${i}`] = {
      label: periods[i].label,
      color: PERIOD_PALETTE[i % PERIOD_PALETTE.length],
    };
  }
  return config;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  stroke: string;
}

function ComparisonTooltip({
  active,
  payload,
  label,
  periods,
  format,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  periods: CmpPeriod[];
  format: (v: number) => string;
}) {
  if (!active) return null;

  const valueByKey: Record<string, number> = {};
  for (const item of payload ?? []) valueByKey[item.dataKey] = item.value;

  // (payload only contains series that have a value at this exact x-point)
  const rows = periods.map((p, idx) => ({
    idx,
    label: p.label,
    color: PERIOD_PALETTE[idx % PERIOD_PALETTE.length],
    isCurrent: idx === 0,
    value: valueByKey[`p${idx}`] ?? null,
  }));

  if (rows.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.625rem",
        padding: "10px 14px",
        boxShadow: "0 4px 24px rgb(0 0 0 / 0.45)",
        fontSize: 13,
        minWidth: 180,
      }}
    >
      <p style={{ color: "var(--muted-foreground)", fontWeight: 600, marginBottom: 8, fontSize: 11 }}>
        {label}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(({ idx, label: periodLabel, color, isCurrent, value }) => (
          <div
            key={idx}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
              <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: color,
                flexShrink: 0,
                boxShadow: isCurrent ? `0 0 0 2px ${color}33` : undefined,
              }}
            />
            <span style={{ color, flexGrow: 1, fontWeight: isCurrent ? 600 : 400 }}>
              {periodLabel}
              {isCurrent && (
                <span style={{ color: "var(--muted-foreground)", fontSize: 10, marginLeft: 4, fontWeight: 400 }}>
                  atual
                </span>
              )}
            </span>
            {/* Value — "—" when period has no data at this x-point */}
            <span
              style={{
                color: value !== null ? "var(--foreground)" : "var(--muted-foreground)",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                marginLeft: 8,
                opacity: value !== null ? 1 : 0.45,
              }}
            >
              {value !== null ? format(Math.abs(value)) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function Pills<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
}) {
  const textClass = size === "xs" ? "text-[10px]" : "text-[11px]";
  const padClass  = size === "xs" ? "px-2 py-0.5" : "px-2.5 py-1";
  return (
    <div className="flex shrink-0 rounded-md border border-border/60 bg-muted/40 p-0.5 gap-px">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${textClass} ${padClass} ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm dark:bg-card dark:shadow-none dark:ring-1 dark:ring-border/60"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}


export function ComparisonChart({
  filters,
  onFiltersChange,
  data,
  loading,
  expanded = false,
}: ComparisonChartProps) {
  const { format, formatCompact } = useCurrency();
  const { periodType, metric, lineCount, cumulative } = filters;

  const periods   = data?.periods ?? [];
  const chartData = mergeIntoChartData(periods, metric, cumulative);
  const config    = buildChartConfig(periods);
  const hasSomeData = chartData.some((row) =>
    periods.some((_, i) => row[`p${i}`] != null),
  );

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Pills options={METRIC_OPTIONS} value={metric} size="xs"
          onChange={(v) => onFiltersChange({ metric: v })} />

        <div className="h-3.5 w-px bg-border/60 shrink-0" />

        <Pills options={PERIOD_OPTIONS} value={periodType} size="xs"
          onChange={(v) => onFiltersChange({ periodType: v })} />

        <div className="h-3.5 w-px bg-border/60 shrink-0" />

        <Pills
          size="xs"
          options={[
            { value: "cumulative" as const, label: "Acumulado" },
            { value: "period"     as const, label: "Período"   },
          ]}
          value={cumulative ? "cumulative" : "period"}
          onChange={(v) => onFiltersChange({ cumulative: v === "cumulative" })}
        />

        <div className="h-3.5 w-px bg-border/60 shrink-0" />

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">Linhas</span>
          <Pills
            size="xs"
            options={[
              { value: "2" as const, label: "2" },
              { value: "3" as const, label: "3" },
              { value: "4" as const, label: "4" },
            ]}
            value={String(lineCount) as "2" | "3" | "4"}
            onChange={(v) => onFiltersChange({ lineCount: Number(v) })}
          />
        </div>
      </div>

      {!loading && periods.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {periods.map((p, i) => (
            <span
              key={p.label}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
            >
              <svg width="24" height="8" className="shrink-0" aria-hidden>
                <line
                  x1="0" y1="4" x2="24" y2="4"
                  stroke={PERIOD_PALETTE[i % PERIOD_PALETTE.length]}
                  strokeWidth={i === 0 ? 2.5 : 1.75}
                  strokeDasharray={i === 0 ? undefined : i === 1 ? undefined : i === 2 ? "5 3" : "2 3"}
                />
              </svg>
              <span style={{ color: PERIOD_PALETTE[i % PERIOD_PALETTE.length] }}>
                {p.label}
              </span>
              {i === 0 && (
                <span className="text-muted-foreground/40">(atual)</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className={`min-h-0 flex-1 ${expanded ? "min-h-[480px]" : ""}`}>
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !hasSomeData ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground">
              Sem dados para o período selecionado.
            </p>
          </div>
        ) : (
          <div className="comparison-chart-wrapper h-full w-full" style={{ isolation: "isolate" }}>
            <ChartContainer config={config} className="h-full w-full">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            >
              <defs>
                {periods.map((_, i) => {
                  const color = PERIOD_PALETTE[i % PERIOD_PALETTE.length];
                  const topOpacity = AREA_FILL_OPACITY[i] ?? 0.06;
                  return (
                    <linearGradient
                      key={i}
                      id={`cmp-grad-${i}`}
                      x1="0" y1="0" x2="0" y2="1"
                    >
                      <stop offset="5%"  stopColor={color} stopOpacity={topOpacity} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>

              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke="var(--border)"
              />
              <XAxis
                dataKey="xLabel"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                minTickGap={20}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => formatCompact(Math.abs(Number(v)))}
                width={62}
                domain={[
                  () => {
                    const allValues = chartData.flatMap(row => 
                      periods.map((_, i) => Number(row[`p${i}`] ?? 0))
                    );
                    const max = Math.max(...allValues, 10);
                    const min = Math.min(...allValues, 0);
                    const ticks = getNiceTicks(min, max);
                    return ticks[0];
                  },
                  () => {
                    const allValues = chartData.flatMap(row => 
                      periods.map((_, i) => Number(row[`p${i}`] ?? 0))
                    );
                    const max = Math.max(...allValues, 10);
                    const min = Math.min(...allValues, 0);
                    const ticks = getNiceTicks(min, max);
                    return ticks[ticks.length - 1];
                  }
                ]}
                ticks={(() => {
                  const allValues = chartData.flatMap(row => 
                    periods.map((_, i) => Number(row[`p${i}`] ?? 0))
                  );
                  const max = Math.max(...allValues, 10);
                  const min = Math.min(...allValues, 0);
                  return getNiceTicks(min, max);
                })()}
              />
              {metric === "net" && (
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 2" />
              )}
              <RechartsTooltip
                content={(props) => (
                  <ComparisonTooltip
                    active={props.active}
                    payload={props.payload as TooltipPayloadItem[] | undefined}
                    label={String(props.label ?? "")}
                    periods={periods}
                    format={format}
                  />
                )}
              />
              {/* Render in reverse order so period 0 (current) is on top */}
              {[...periods].reverse().map((p, ri) => {
                const i = periods.length - 1 - ri;
                const color = PERIOD_PALETTE[i % PERIOD_PALETTE.length];
                return (
                  <Area
                    key={p.label}
                    dataKey={`p${i}`}
                    type="linear"
                    stroke={color}
                    strokeWidth={i === 0 ? 2.5 : 1.75}
                    strokeDasharray={i === 0 ? undefined : i === 1 ? undefined : i === 2 ? "5 3" : "2 3"}
                    fill={`url(#cmp-grad-${i})`}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </div>
  );
}
