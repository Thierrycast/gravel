import { NextResponse } from "next/server";
import { getCashFlowMetrics } from "@/lib/domain/analytics";
import { serializeForJson } from "@/lib/core/http";

export const dynamic = "force-dynamic";

type PeriodType = "month" | "quarter" | "semester" | "year";

interface PeriodWindow {
  label: string;
  from: Date;
  to: Date;
}

function getPeriodWindows(periodType: PeriodType, count: number): PeriodWindow[] {
  const now = new Date();
  const windows: PeriodWindow[] = [];

  for (let i = 0; i < count; i++) {
    if (periodType === "month") {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      windows.push({
        label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        from: new Date(d.getFullYear(), d.getMonth(), 1),
        to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      });
    } else if (periodType === "quarter") {
      const currentQ = Math.floor(now.getMonth() / 3);
      const totalQ = now.getFullYear() * 4 + currentQ - i;
      const qYear = Math.floor(totalQ / 4);
      const qIndex = ((totalQ % 4) + 4) % 4;
      const qStart = qIndex * 3;
      windows.push({
        label: `T${qIndex + 1} ${qYear}`,
        from: new Date(qYear, qStart, 1),
        to: new Date(qYear, qStart + 3, 0, 23, 59, 59, 999),
      });
    } else if (periodType === "semester") {
      const currentH = Math.floor(now.getMonth() / 6);
      const totalH = now.getFullYear() * 2 + currentH - i;
      const hYear = Math.floor(totalH / 2);
      const hIndex = ((totalH % 2) + 2) % 2;
      const hStart = hIndex * 6;
      windows.push({
        label: `${hIndex === 0 ? "1º" : "2º"} sem. ${hYear}`,
        from: new Date(hYear, hStart, 1),
        to: new Date(hYear, hStart + 6, 0, 23, 59, 59, 999),
      });
    } else {
      const year = now.getFullYear() - i;
      windows.push({
        label: String(year),
        from: new Date(year, 0, 1),
        to: new Date(year, 11, 31, 23, 59, 59, 999),
      });
    }
  }

  return windows;
}

function groupByFor(periodType: PeriodType): string {
  return periodType === "month" ? "day" : "month";
}

function periodToX(
  periodStr: string,
  periodType: PeriodType,
  windowFrom: Date,
): number {
  if (periodType === "month") {
    // "2026-05-14" → day 14
    const parts = periodStr.split("-");
    return parseInt(parts[2] ?? "1", 10);
  } else {
    // "2026-05" → month offset from window start (1-based)
    const parts = periodStr.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-based
    const offsetMonths =
      (year - windowFrom.getFullYear()) * 12 +
      (month - windowFrom.getMonth());
    return offsetMonths + 1; // 1-based
  }
}

function xLabel(x: number, periodType: PeriodType, windowFrom: Date): string {
  if (periodType === "month") return String(x);

  const months = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  const date = new Date(
    windowFrom.getFullYear(),
    windowFrom.getMonth() + x - 1,
    1,
  );
  return months[date.getMonth()] ?? String(x);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodType = (searchParams.get("periodType") ?? "month") as PeriodType;
  const count = Math.min(4, Math.max(2, parseInt(searchParams.get("count") ?? "2", 10)));

  const windows = getPeriodWindows(periodType, count);
  const groupBy = groupByFor(periodType);

  const periodsData = await Promise.all(
    windows.map(async (window) => {
      const params = new URLSearchParams({
        from: window.from.toISOString().split("T")[0],
        to: window.to.toISOString().split("T")[0],
        groupBy,
      });

      const metrics = await getCashFlowMetrics(params);

      const buckets = new Map<number, { net: number; income: number; expense: number }>();
      for (const point of metrics) {
        const x = periodToX(point.period, periodType, window.from);
        const prev = buckets.get(x) ?? { net: 0, income: 0, expense: 0 };
        buckets.set(x, {
          net: prev.net + Number(point.net),
          income: prev.income + Number(point.inflow),
          expense: prev.expense + Number(point.outflow),
        });
      }

      const sorted = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
      let cumNet = 0;
      let cumIncome = 0;
      let cumExpense = 0;
      const points = sorted.map(([x, vals]) => {
        cumNet += vals.net;
        cumIncome += vals.income;
        cumExpense += vals.expense;
        const r = (n: number) => Math.round(n * 100) / 100;
        return {
          x,
          xLabel: xLabel(x, periodType, window.from),
          net: r(vals.net),
          income: r(vals.income),
          expense: r(vals.expense),
          cumNet: r(cumNet),
          cumIncome: r(cumIncome),
          cumExpense: r(cumExpense),
        };
      });

      return {
        label: window.label,
        from: window.from.toISOString().split("T")[0],
        to: window.to.toISOString().split("T")[0],
        points,
      };
    }),
  );

  return NextResponse.json(serializeForJson({ periods: periodsData, periodType }));
}
