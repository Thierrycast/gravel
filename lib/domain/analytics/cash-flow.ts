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
