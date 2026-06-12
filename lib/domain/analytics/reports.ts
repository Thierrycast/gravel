import { DomainTransactionDirection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildMetricFilters,
  buildTransactionWhere,
  decimal,
  EXCLUDED_SPENDING_CATEGORIES,
  INVESTMENT_TRANSFER_TERMS,
  normalizeBillStatus,
  percentOf,
  startOfLocalDay,
  sumDecimals,
  ZERO,
} from "./shared";

export async function getBillsSummaryMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, { limit: 12 });
  const now = new Date();
  const dueIn7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueIn30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const hasDateWindow =
    searchParams.has("from") ||
    searchParams.has("to") ||
    searchParams.has("period");

  const bills = await prisma.domainBill.findMany({
    where: {
      sourceProvider: filters.provider,
      domainAccountId: filters.accountId,
      dueDate: hasDateWindow
        ? {
            gte: filters.from,
            lte: filters.to,
          }
        : undefined,
    },
    orderBy: [{ dueDate: "asc" }, { totalAmount: "desc" }],
  });

  const normalizedBills = bills.map((bill) => ({
    ...bill,
    status: normalizeBillStatus(
      bill.status,
      bill.dueDate,
      bill.totalAmount,
      now,
    ),
  }));

  const totalAmount = sumDecimals(
    normalizedBills.map((bill) => bill.totalAmount),
  );
  const minimumPayment = sumDecimals(
    normalizedBills.map((bill) => bill.minimumPaymentAmount),
  );
  const paid = normalizedBills.filter(
    (bill) => bill.status === "PAID" || bill.status === "CLOSED",
  );
  const overdue = normalizedBills.filter((bill) => bill.status === "OVERDUE");
  const open = normalizedBills.filter((bill) => bill.status === "OPEN");
  const upcoming = normalizedBills
    .filter(
      (bill) =>
        bill.dueDate &&
        bill.dueDate >= startOfLocalDay(now) &&
        bill.status === "OPEN",
    )
    .slice(0, filters.limit);

  return {
    totalAmount,
    minimumPayment,
    openAmount: sumDecimals(open.map((bill) => bill.totalAmount)),
    paidAmount: sumDecimals(paid.map((bill) => bill.totalAmount)),
    overdueAmount: sumDecimals(overdue.map((bill) => bill.totalAmount)),
    dueIn7DaysAmount: sumDecimals(
      normalizedBills
        .filter(
          (bill) =>
            bill.status === "OPEN" &&
            bill.dueDate &&
            bill.dueDate >= now &&
            bill.dueDate <= dueIn7,
        )
        .map((bill) => bill.totalAmount),
    ),
    dueIn30DaysAmount: sumDecimals(
      normalizedBills
        .filter(
          (bill) =>
            bill.status === "OPEN" &&
            bill.dueDate &&
            bill.dueDate >= now &&
            bill.dueDate <= dueIn30,
        )
        .map((bill) => bill.totalAmount),
    ),
    counts: {
      bills: normalizedBills.length,
      open: open.length,
      overdue: overdue.length,
      paid: paid.length,
    },
    upcoming,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
    },
  };
}

export async function getSpendingByCategoryMetrics(
  searchParams: URLSearchParams,
) {
  const filters = buildMetricFilters(searchParams, {
    period: "mtd",
    limit: 20,
  });
  const excludedCategories = await prisma.domainCategory.findMany({
    where: {
      OR: [
        { kind: "TRANSFER" },
        ...EXCLUDED_SPENDING_CATEGORIES.map((name) => ({
          name: { contains: name },
        })),
      ],
    },
    select: { id: true },
  });
  const excludedIds = excludedCategories.map((category) => category.id);

  // Exclude investment/transfer transactions by description, mirroring the
  // classifyCashFlowTransaction logic used by the overview API so KPI totals
  // and Sankey category sums share the same transaction set.
  const investmentDescriptionFilter = INVESTMENT_TRANSFER_TERMS.flatMap(
    (term) => [
      { description: { contains: term } },
      {
        normalizedDescription: {
          contains: term,
        },
      },
    ],
  );

  const grouped = await prisma.domainTransaction.groupBy({
    by: ["domainCategoryId"],
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
      domainCategoryId: { notIn: excludedIds },
      NOT: { OR: investmentDescriptionFilter },
    },
    _sum: { amount: true },
    _count: true,
  });

  const categoryIds = grouped
    .map((group) => group.domainCategoryId)
    .filter((id): id is string => Boolean(id));

  const categoryDetails = await prisma.domainCategory.findMany({
    where: { id: { in: categoryIds } },
  });
  const categoryMap = new Map(
    categoryDetails.map((category) => [category.id, category]),
  );

  const groups = grouped.map((group) => {
    const category = group.domainCategoryId
      ? categoryMap.get(group.domainCategoryId)
      : null;
    const amount = decimal(group._sum?.amount).abs();

    return {
      categoryId: group.domainCategoryId,
      name: category?.name ?? "Sem categoria",
      amount,
      count: Number(group._count) || 0,
      averageAmount: group._count ? amount.div(Number(group._count)) : ZERO,
    };
  });

  const total = sumDecimals(groups.map((group) => group.amount));
  const results = groups
    .map((group) => ({
      ...group,
      sharePercent: percentOf(group.amount, total),
    }))
    .sort((left, right) => right.amount.comparedTo(left.amount))
    .slice(0, filters.limit);

  return {
    total,
    results,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
      categoryId: filters.categoryId,
      accountId: filters.accountId,
    },
  };
}

export async function getSpendingByMerchantMetrics(
  searchParams: URLSearchParams,
) {
  const filters = buildMetricFilters(searchParams, {
    period: "mtd",
    limit: 12,
  });

  // Apply the same category exclusions used by getSpendingByCategoryMetrics so
  // the merchant totals are consistent with the category/KPI totals (no
  // transfers or investment transactions inflating the numbers).
  const excludedCategories = await prisma.domainCategory.findMany({
    where: {
      OR: [
        { kind: "TRANSFER" },
        ...EXCLUDED_SPENDING_CATEGORIES.map((name) => ({
          name: { contains: name },
        })),
      ],
    },
    select: { id: true },
  });
  const excludedCategoryIds = excludedCategories.map((c) => c.id);

  const investmentDescriptionFilter = INVESTMENT_TRANSFER_TERMS.flatMap(
    (term) => [
      { description: { contains: term } },
      {
        normalizedDescription: {
          contains: term,
        },
      },
    ],
  );

  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
      domainCategoryId: { notIn: excludedCategoryIds },
      NOT: { OR: investmentDescriptionFilter },
    },
    orderBy: [{ occurredAt: "desc" }],
  });

  const merchants = await prisma.domainMerchant.findMany();
  const merchantMap = new Map(
    merchants.map((merchant) => [merchant.id, merchant]),
  );
  const groups = new Map<
    string,
    {
      merchantId: string | null;
      name: string;
      cnpj: string | null;
      amount: import("@prisma/client").Prisma.Decimal;
      count: number;
      averageAmount: import("@prisma/client").Prisma.Decimal;
    }
  >();

  for (const transaction of transactions) {
    const merchant = transaction.domainMerchantId
      ? merchantMap.get(transaction.domainMerchantId)
      : null;
    const key =
      transaction.domainMerchantId ?? transaction.merchantName ?? "unknown";
    const current = groups.get(key) ?? {
      merchantId: transaction.domainMerchantId,
      name:
        merchant?.displayName ?? transaction.merchantName ?? "Não identificado",
      cnpj: merchant?.cnpj ?? transaction.merchantCnpj ?? null,
      amount: ZERO,
      count: 0,
      averageAmount: ZERO,
    };

    current.amount = current.amount.plus(transaction.amount.abs());
    current.count += 1;
    current.averageAmount = current.amount.div(current.count);
    groups.set(key, current);
  }

  const total = sumDecimals(
    Array.from(groups.values()).map((group) => group.amount),
  );
  const results = Array.from(groups.values())
    .map((group) => ({
      ...group,
      sharePercent: percentOf(group.amount, total),
    }))
    .sort((left, right) => right.amount.comparedTo(left.amount))
    .slice(0, filters.limit);

  return {
    total,
    results,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
      merchantId: filters.merchantId,
      accountId: filters.accountId,
    },
  };
}

export async function getSpendingTrendsMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, { period: "12m" });

  const [transactions, categories] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        ...buildTransactionWhere(filters),
        direction: DomainTransactionDirection.OUTFLOW,
        ignored: false,
      },
      select: { amount: true, occurredAt: true, domainCategoryId: true },
    }),
    prisma.domainCategory.findMany({ select: { id: true, name: true } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const buckets = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    const catName = (tx.domainCategoryId ? catMap.get(tx.domainCategoryId) : null) ?? "Sem categoria";
    if (EXCLUDED_SPENDING_CATEGORIES.some((ex) => catName.toLowerCase().includes(ex))) continue;
    const monthKey = `${tx.occurredAt.getUTCFullYear()}-${String(tx.occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthly = buckets.get(catName) ?? new Map<string, number>();
    monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + Math.abs(Number(tx.amount)));
    buckets.set(catName, monthly);
  }

  const rangeFrom = filters.from ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const rangeTo = filters.to ?? new Date();
  const months: string[] = [];
  const cursor = new Date(Date.UTC(rangeFrom.getUTCFullYear(), rangeFrom.getUTCMonth(), 1));
  while (cursor <= rangeTo) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const topCategories = Array.from(buckets.entries())
    .map(([name, monthly]) => ({
      name,
      total: Array.from(monthly.values()).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const results = topCategories.map(({ name, total }) => ({
    category: name,
    total,
    trend: months.map((month) => ({
      period: month,
      amount: buckets.get(name)?.get(month) ?? 0,
    })),
  }));

  return {
    summary: { months, total: results.length },
    results,
  };
}
