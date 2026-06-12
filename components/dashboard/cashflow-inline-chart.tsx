"use client";

import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.35)",
  fontSize: 12,
  minWidth: 140,
};

const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "var(--muted-foreground)",
  fontWeight: 600,
  marginBottom: 6,
};

const CASHFLOW_COLORS: Record<string, string> = {
  income:      "var(--chart-2)",
  expense:     "var(--chart-4)",
  investments: "var(--chart-3)",
  net:         "#1d4ed8",
};

const CASHFLOW_LABELS: Record<string, string> = {
  income:      "Entradas",
  expense:     "Saídas",
  investments: "Investimentos",
  net:         "Saldo",
};

interface RechartPayloadItem {
  dataKey: string;
  value: number;
  fill?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
}

function CashFlowTooltip({
  active,
  payload,
  label,
  format,
  subMode,
}: {
  active?: boolean;
  payload?: RechartPayloadItem[];
  label?: string;
  format: (v: number) => string;
  subMode: "all" | "inflow" | "outflow";
}) {
  if (!active) return null;

  const keys =
    subMode === "all"
      ? ["income", "expense", "investments", "net"]
      : subMode === "inflow"
        ? ["income"]
        : ["expense"];

  const valueMap: Record<string, number> = {};
  for (const item of payload ?? []) valueMap[item.dataKey] = item.value;

  return (
    <div style={TOOLTIP_STYLE}>
      <p style={TOOLTIP_LABEL_STYLE}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {keys.map((key) => {
          const color = CASHFLOW_COLORS[key] ?? "var(--foreground)";
          const name  = CASHFLOW_LABELS[key] ?? key;
          const value = valueMap[key] ?? 0;
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0, display: "inline-block" }} />
              <span style={{ color, flexGrow: 1 }}>{name}</span>
              <span style={{ color: "var(--foreground)", fontWeight: 600, fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>
                {format(Math.abs(value))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CashFlowPoint = {
  date: string;
  income: number;
  expense: number;
  investments: number;
  net: number;
};

export function CashFlowInlineChart({
  data,
  subMode,
  format,
  formatCompact,
  compact = false,
}: {
  data: CashFlowPoint[];
  subMode: "all" | "inflow" | "outflow";
  format: (v: number) => string;
  formatCompact: (v: number) => string;
  compact?: boolean;
}) {
  const margin = compact
    ? { top: 16, right: 12, left: 0, bottom: 16 }
    : { top: 12, right: 8, left: 0, bottom: 8 };
  const tickFontSize = compact ? 10 : 11;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={margin} barGap={2} barCategoryGap="25%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: tickFontSize, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
          tickFormatter={(value) => {
            if (!value) return "";
            const parts = String(value).split("T")[0].split("-");
            if (parts.length === 3) {
              const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
              return `${parts[2]}/${months[parseInt(parts[1], 10) - 1] ?? ""}`;
            }
            return String(value);
          }}
          minTickGap={28}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: tickFontSize, fontFamily: "monospace", fill: "var(--muted-foreground)" }}
          tickFormatter={(v) => formatCompact(Number(v))}
          width={72}
        />
        <ReferenceLine
          x={new Date().toISOString().slice(0, 10)}
          stroke="var(--muted-foreground)"
          strokeDasharray="3 3"
          label={{ value: "hoje", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 10, offset: 5 }}
        />
        <RechartsTooltip
          content={(props) => (
            <CashFlowTooltip
              active={props.active}
              payload={props.payload as RechartPayloadItem[] | undefined}
              label={(() => {
                const v = String(props.label ?? "");
                const parts = v.split("T")[0].split("-");
                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : v;
              })()}
              format={format}
              subMode={subMode}
            />
          )}
          cursor={{ fill: "var(--muted)", fillOpacity: 0.15 }}
        />
        <Line
          key="line-investments"
          name="Investimentos"
          dataKey="investments"
          stroke={CASHFLOW_COLORS.investments}
          strokeWidth={1.5}
          dot={{ r: 1.5, fill: CASHFLOW_COLORS.investments, strokeWidth: 0 }}
          activeDot={{ r: 3, strokeWidth: 0 }}
          type="monotone"
          isAnimationActive={false}
          yAxisId={0}
        />
        <Line
          key="line-net"
          name="Saldo"
          dataKey="net"
          stroke={CASHFLOW_COLORS.net}
          strokeWidth={2}
          dot={{ r: 2, fill: CASHFLOW_COLORS.net, strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 0 }}
          type="monotone"
          isAnimationActive={false}
          yAxisId={0}
        />
        {(subMode === "all" || subMode === "inflow") && (
          <Bar dataKey="income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} barSize={20} />
        )}
        {(subMode === "all" || subMode === "outflow") && (
          <Bar dataKey="expense" fill="var(--chart-4)" radius={[4, 4, 0, 0]} barSize={20} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
