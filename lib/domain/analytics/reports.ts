import { Prisma } from "@prisma/client";
import { isBrlCurrency } from "@/lib/domain/currency";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";
import {
  buildMetricFilters,
  buildTransactionWhere,
  classifyCashFlowTransaction,
  decimal,
  detectInternalTransferPairIds,
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

  const [allTxs, usdBrlRate] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: buildTransactionWhere(filters),
      include: {
        domainCategory: { select: { name: true, kind: true } }
      }
    }),
    getUsdBrlRate(),
  ]);

  const internalTransferPairIds = detectInternalTransferPairIds(allTxs);

  const groups = new Map<string, {
    categoryId: string | null;
    name: string;
    amount: import("@prisma/client").Prisma.Decimal;
    count: number;
    averageAmount: import("@prisma/client").Prisma.Decimal;
  }>();

  for (const tx of allTxs) {
    if (internalTransferPairIds.has(tx.id)) continue;
    const classification = classifyCashFlowTransaction(
      tx.direction,
      tx.domainCategory?.name,
      tx.domainCategory?.kind,
      tx.description ?? tx.normalizedDescription,
    );

    if (classification === "expense") {
      const key = tx.domainCategoryId ?? "unknown";
      const current = groups.get(key) ?? {
        categoryId: tx.domainCategoryId,
        name: tx.domainCategory?.name ?? "Sem categoria",
        amount: ZERO,
        count: 0,
        averageAmount: ZERO,
      };

      let amount = decimal(tx.amount).abs();
      if (tx.currencyCode && !isBrlCurrency(tx.currencyCode)) {
        amount = amount.mul(new Prisma.Decimal(usdBrlRate));
      }
      current.amount = current.amount.plus(amount);
      current.count += 1;
      current.averageAmount = current.amount.div(current.count);
      groups.set(key, current);
    }
  }

  const groupsArray = Array.from(groups.values());

  const total = sumDecimals(groupsArray.map((group) => group.amount));
  const results = groupsArray
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

  const [allTxs, usdBrlRate] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: buildTransactionWhere(filters),
      include: {
        domainCategory: { select: { name: true, kind: true } }
      },
      orderBy: [{ occurredAt: "desc" }]
    }),
    getUsdBrlRate(),
  ]);

  const internalTransferPairIds = detectInternalTransferPairIds(allTxs);

  const transactions = allTxs.filter((tx) => {
    if (internalTransferPairIds.has(tx.id)) return false;
    const classification = classifyCashFlowTransaction(
      tx.direction,
      tx.domainCategory?.name,
      tx.domainCategory?.kind,
      tx.description ?? tx.normalizedDescription,
    );
    return classification === "expense";
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

    let amount = transaction.amount.abs();
    if (transaction.currencyCode && !isBrlCurrency(transaction.currencyCode)) {
      amount = amount.mul(new Prisma.Decimal(usdBrlRate));
    }
    current.amount = current.amount.plus(amount);
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

  const [allTxs, usdBrlRate] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: buildTransactionWhere(filters),
      include: {
        domainCategory: { select: { name: true, kind: true } }
      }
    }),
    getUsdBrlRate(),
  ]);
  const internalTransferPairIds = detectInternalTransferPairIds(allTxs);

  const buckets = new Map<string, Map<string, number>>();

  for (const tx of allTxs) {
    if (internalTransferPairIds.has(tx.id)) continue;
    const classification = classifyCashFlowTransaction(
      tx.direction,
      tx.domainCategory?.name,
      tx.domainCategory?.kind,
      tx.description ?? tx.normalizedDescription,
    );

    if (classification === "expense") {
      const catName = tx.domainCategory?.name ?? "Sem categoria";
      const monthKey = `${tx.occurredAt.getUTCFullYear()}-${String(tx.occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthly = buckets.get(catName) ?? new Map<string, number>();
      let amount = Math.abs(Number(tx.amount));
      if (tx.currencyCode && !isBrlCurrency(tx.currencyCode)) {
        amount *= usdBrlRate;
      }
      monthly.set(monthKey, (monthly.get(monthKey) ?? 0) + amount);
      buckets.set(catName, monthly);
    }
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
