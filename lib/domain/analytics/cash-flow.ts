import { DomainTransactionDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildMetricFilters,
  buildTransactionWhere,
  classifyCashFlowTransaction,
  formatBucket,
  ZERO,
} from "./shared";

export async function getCashFlowMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "180d",
    groupBy: "month",
  });

  const [transactions, categories] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: buildTransactionWhere(filters),
      orderBy: { occurredAt: "asc" },
    }),
    prisma.domainCategory.findMany(),
  ]);

  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );

  const buckets = new Map<
    string,
    {
      inflow: import("@prisma/client").Prisma.Decimal;
      outflow: import("@prisma/client").Prisma.Decimal;
      investments: import("@prisma/client").Prisma.Decimal;
      net: import("@prisma/client").Prisma.Decimal;
      transactions: number;
    }
  >();

  for (const transaction of transactions) {
    const key = formatBucket(transaction.occurredAt, filters.groupBy);
    const current = buckets.get(key) ?? {
      inflow: ZERO,
      outflow: ZERO,
      investments: ZERO,
      net: ZERO,
      transactions: 0,
    };
    const cat = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null;
    const classification = classifyCashFlowTransaction(
      transaction.direction,
      cat?.name,
      cat?.kind,
      transaction.description ?? transaction.normalizedDescription,
    );

    if (classification === "investment") {
      current.investments =
        transaction.direction === DomainTransactionDirection.OUTFLOW
          ? current.investments.plus(transaction.amount.abs())
          : current.investments.minus(transaction.amount.abs());
      current.transactions += 1;
      current.net = current.inflow
        .minus(current.outflow)
        .minus(current.investments);
      buckets.set(key, current);
      continue;
    }

    if (classification === "excluded") continue;

    if (classification === "income") {
      current.inflow = current.inflow.plus(transaction.amount.abs());
    } else if (classification === "expense") {
      current.outflow = current.outflow.plus(transaction.amount.abs());
    }

    current.transactions += 1;
    current.net = current.inflow
      .minus(current.outflow)
      .minus(current.investments);
    buckets.set(key, current);
  }

  return Array.from(buckets.entries()).map(([period, values]) => ({
    period,
    ...values,
  }));
}

type PeriodType = "month" | "quarter" | "semester" | "year";

function getCashFlowComparisonWindows(periodType: PeriodType, count: number) {
  const now = new Date();
  const windows: { label: string; from: Date; to: Date }[] = [];
  for (let i = 0; i < count; i++) {
    if (periodType === "month") {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      windows.push({
        label: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        from: new Date(d.getFullYear(), d.getMonth(), 1),
        to: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      });
    } else if (periodType === "quarter") {
      const totalQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - i;
      const qYear = Math.floor(totalQ / 4);
      const qIndex = ((totalQ % 4) + 4) % 4;
      const qStart = qIndex * 3;
      windows.push({
        label: `T${qIndex + 1} ${qYear}`,
        from: new Date(qYear, qStart, 1),
        to: new Date(qYear, qStart + 3, 0, 23, 59, 59, 999),
      });
    } else if (periodType === "semester") {
      const totalH = now.getFullYear() * 2 + Math.floor(now.getMonth() / 6) - i;
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

function periodToX(periodStr: string, periodType: PeriodType, windowFrom: Date): number {
  if (periodType === "month") {
    return parseInt(periodStr.split("-")[2] ?? "1", 10);
  }
  const parts = periodStr.split("-");
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  return (year - windowFrom.getFullYear()) * 12 + (month - windowFrom.getMonth()) + 1;
}

function xLabel(x: number, periodType: PeriodType, windowFrom: Date): string {
  if (periodType === "month") return String(x);
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const date = new Date(windowFrom.getFullYear(), windowFrom.getMonth() + x - 1, 1);
  return months[date.getMonth()] ?? String(x);
}

export async function getCashFlowComparisonMetrics(searchParams: URLSearchParams) {
  const periodType = (searchParams.get("periodType") ?? "month") as PeriodType;
  const count = Math.min(4, Math.max(2, parseInt(searchParams.get("count") ?? "2", 10)));
  const windows = getCashFlowComparisonWindows(periodType, count);
  const groupBy = periodType === "month" ? "day" : "month";

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
      let cumNet = 0, cumIncome = 0, cumExpense = 0;
      const points = sorted.map(([x, vals]) => {
        cumNet += vals.net; cumIncome += vals.income; cumExpense += vals.expense;
        const r = (n: number) => Math.round(n * 100) / 100;
        return { x, xLabel: xLabel(x, periodType, window.from), net: r(vals.net), income: r(vals.income), expense: r(vals.expense), cumNet: r(cumNet), cumIncome: r(cumIncome), cumExpense: r(cumExpense) };
      });
      return { label: window.label, from: window.from.toISOString().split("T")[0], to: window.to.toISOString().split("T")[0], points };
    }),
  );

  return { periods: periodsData, periodType };
}
