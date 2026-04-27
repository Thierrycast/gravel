import { NextResponse } from "next/server";

import {
  getRecurringPayload,
  refreshRecurringDerived,
} from "@/lib/domain/derived";
import { serializeForJson } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";
import { getMerchantLogo } from "@/lib/domain/utils";
import type { RecurringRule } from "@/lib/types/api";

export const dynamic = "force-dynamic";

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export async function GET() {
  const existing = await prisma.domainRecurringRule.count({
    where: { active: true },
  });
  if (existing === 0) {
    await refreshRecurringDerived();
  }

  const rules = await getRecurringPayload();
  const installmentGroups = await prisma.transactionInstallmentGroup.findMany({
    orderBy: [{ lastDate: "desc" }],
  });
  const installmentGroupIds = installmentGroups.map((group) => group.id);
  const installmentTransactions = await prisma.domainTransaction.findMany({
    where:
      installmentGroupIds.length > 0
        ? { installmentGroupId: { in: installmentGroupIds } }
        : { id: "__none__" },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
  const transactionsByInstallmentGroup = new Map<
    string,
    typeof installmentTransactions
  >();
  for (const transaction of installmentTransactions) {
    if (!transaction.installmentGroupId) continue;
    transactionsByInstallmentGroup.set(transaction.installmentGroupId, [
      ...(transactionsByInstallmentGroup.get(transaction.installmentGroupId) ??
        []),
      transaction,
    ]);
  }

  const categories = await prisma.domainCategory.findMany();
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const merchantIds = Array.from(
    new Set([
      ...rules.map((r) => r.merchantId).filter(Boolean),
      ...installmentTransactions
        .map((transaction) => transaction.domainMerchantId)
        .filter(Boolean),
    ]),
  ) as string[];
  const merchants = await prisma.domainMerchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, displayName: true },
  });
  const merchantMap = new Map(merchants.map((m) => [m.id, m.displayName]));
  const merchantEnrichments = await prisma.merchantEnrichment.findMany({
    where:
      merchantIds.length > 0
        ? { domainMerchantId: { in: merchantIds } }
        : { id: "__none__" },
    select: { domainMerchantId: true, logoUrl: true },
  });
  const merchantLogoMap = new Map(
    merchantEnrichments.map((item) => [item.domainMerchantId, item.logoUrl]),
  );

  // Map to UI-expected field names
  const mapped: RecurringRule[] = rules.map((r) => {
    const merchantName = r.merchantId ? merchantMap.get(r.merchantId) : null;
    return {
      id: r.id,
      description: r.title,
      amount: Number(r.amount),
      frequency: r.interval,
      category: r.categoryId
        ? (categoryMap.get(r.categoryId) ?? "Sem categoria")
        : "Sem categoria",
      categoryId: r.categoryId,
      nextDate: r.nextDate.toISOString(),
      type: r.type,
      occurrences: r.occurrences ?? 0,
      lastDate: r.lastOccurrenceAt?.toISOString() ?? null,
      confidence: r.confidence ?? 0,
      isManual: r.origin === "manual",
      origin: r.origin as "detected" | "manual",
      merchantName: merchantName ?? null,
      logoUrl:
        (r.merchantId ? merchantLogoMap.get(r.merchantId) : null) ??
        getMerchantLogo(merchantName || r.title),
      isInstallment: r.isInstallment ?? false,
    };
  });

  const installmentMapped = installmentGroups.flatMap<RecurringRule>(
    (group) => {
      const transactions = transactionsByInstallmentGroup.get(group.id) ?? [];
      const firstTransaction = transactions[0];
      const lastTransaction = transactions.at(-1);
      if (!firstTransaction || !lastTransaction) return [];

      const currentInstallment =
        Math.max(
          ...transactions.map(
            (transaction) => transaction.installmentNumber ?? 0,
          ),
        ) || transactions.length;
      const totalInstallments = Math.max(
        group.totalInstallments,
        lastTransaction.installmentTotal ?? 0,
        currentInstallment,
      );
      if (currentInstallment >= totalInstallments) return [];

      const merchantName = lastTransaction.domainMerchantId
        ? merchantMap.get(lastTransaction.domainMerchantId)
        : lastTransaction.merchantName;
      const description =
        merchantName ??
        lastTransaction.description ??
        group.descriptionKey ??
        "Parcela detectada";
      const finalDate = addMonths(
        firstTransaction.occurredAt,
        totalInstallments - 1,
      );

      return [
        {
          id: `installment-${group.id}`,
          description,
          amount: Number(group.amount),
          frequency: "MONTHLY",
          category: group.categoryId
            ? (categoryMap.get(group.categoryId) ?? "Sem categoria")
            : "Sem categoria",
          categoryId: group.categoryId,
          nextDate: addMonths(lastTransaction.occurredAt, 1).toISOString(),
          type: "EXPENSE",
          occurrences: totalInstallments,
          lastDate: finalDate.toISOString(),
          confidence: Number(group.confidence),
          isManual: false,
          origin: "detected" as const,
          merchantName: merchantName ?? null,
          logoUrl:
            (lastTransaction.domainMerchantId
              ? merchantLogoMap.get(lastTransaction.domainMerchantId)
              : null) ?? getMerchantLogo(description),
          isInstallment: true,
          currentInstallment,
          totalInstallments,
          installmentRemaining: Math.max(
            totalInstallments - currentInstallment,
            0,
          ),
        },
      ];
    },
  );

  function normalizeMonthlyAmount(amount: number, interval: string): number {
    const value = Math.abs(amount);
    switch (interval.toUpperCase()) {
      case "WEEKLY":
        return value * 4.333;
      case "BIWEEKLY":
        return value * 2.166;
      case "MONTHLY":
        return value;
      case "QUARTERLY":
        return value / 3;
      case "YEARLY":
        return value / 12;
      default:
        return value;
    }
  }

  const summary = {
    totalMonthlyExpenses:
      rules
        .filter((r) => r.type === "EXPENSE")
        .reduce(
          (sum, r) =>
            sum + normalizeMonthlyAmount(Number(r.amount), r.interval),
          0,
        ) +
      installmentMapped.reduce((sum, item) => sum + Math.abs(item.amount), 0),
    totalMonthlyIncome: rules
      .filter((r) => r.type === "INCOME")
      .reduce(
        (sum, r) => sum + normalizeMonthlyAmount(Number(r.amount), r.interval),
        0,
      ),
    count: mapped.length + installmentMapped.length,
  };

  return NextResponse.json(
    serializeForJson({ rules: [...mapped, ...installmentMapped], summary }),
  );
}
