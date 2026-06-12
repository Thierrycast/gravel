"use client";

import React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
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

interface PiePayloadItem {
  fill?: string;
  value: number;
  name?: string;
  payload?: {
    name?: string;
    emoji?: string;
    share?: number;
    color?: string;
    fill?: string;
  };
}

function CategoryTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: PiePayloadItem[];
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item  = payload[0];
  const data  = item?.payload;
  const color = data?.color ?? data?.fill ?? item?.fill ?? "var(--foreground)";
  const name  = data?.name ?? item?.name ?? "";
  const emoji = data?.emoji ?? "";
  const share = data?.share;

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0, display: "inline-block" }} />
        <span style={{ color, fontWeight: 600 }}>
          {emoji ? `${emoji} ${name}` : name}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, paddingLeft: 17 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <span style={{ color: "var(--muted-foreground)" }}>Valor</span>
          <span style={{ color: "var(--foreground)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {format(item.value)}
          </span>
        </div>
        {share != null && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--muted-foreground)" }}>Fatia</span>
            <span style={{ color: "var(--foreground)", fontWeight: 600 }}>
              {share.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export type PieDataEntry = {
  name: string;
  value: number;
  color: string;
  emoji?: string;
  share: number;
};

export function CategoryInlineChart({
  pieData,
  format,
  compact = false,
}: {
  pieData: PieDataEntry[];
  format: (v: number) => string;
  compact?: boolean;
}) {
  const containerWidth = compact ? "55%" : "50%";
  const innerRadius    = compact ? "52%" : "40%";
  const outerRadius    = compact ? "80%" : "76%";

  return (
    <ResponsiveContainer width={containerWidth} height="100%">
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {pieData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} opacity={0.9} />
          ))}
        </Pie>
        <RechartsTooltip
          content={(props) => (
            <CategoryTooltip
              active={props.active}
              payload={props.payload as PiePayloadItem[] | undefined}
              format={format}
            />
          )}
          cursor={false}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
