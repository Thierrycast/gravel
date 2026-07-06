import { NextResponse } from "next/server";

import {
  getRecurringPayload,
  ensureRecurringDerivedFresh,
} from "@/lib/domain/derived";
import {
  createManualRecurringRule,
  monthlyEquivalentAmount,
  validateManualRecurringInput,
} from "@/lib/domain/recurring";
import { serializeForJson } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";
import { getMerchantLogo } from "@/lib/domain/utils";
import type { RecurringRule } from "@/lib/types/api";

export const dynamic = "force-dynamic";

type InstallmentTransaction = Awaited<
  ReturnType<typeof prisma.domainTransaction.findMany>
>[number];

type InstallmentOccurrence = {
  date: Date;
  amount: number;
  number: number;
  projected: boolean;
  transaction: InstallmentTransaction;
};

type InstallmentSeries = {
  id: string;
  totalInstallments: number;
  transactions: InstallmentTransaction[];
};

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

function monthEnd(monthStart: Date) {
  return new Date(
    Date.UTC(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  );
}

function sameMonth(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth()
  );
}

function getReferenceMonth(request: Request) {
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const requestedYear = Number.parseInt(searchParams.get("year") ?? "", 10);
  const requestedMonth = Number.parseInt(searchParams.get("month") ?? "", 10);
  const year =
    Number.isInteger(requestedYear) && requestedYear >= 2000
      ? requestedYear
      : now.getUTCFullYear();
  const month =
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 1 &&
    requestedMonth <= 12
      ? requestedMonth
      : now.getUTCMonth() + 1;
  return new Date(Date.UTC(year, month - 1, 1));
}

function seriesDescription(transaction: InstallmentTransaction) {
  let text =
    transaction.description ??
    transaction.normalizedDescription ??
    transaction.merchantName ??
    "parcela";

  if (transaction.installmentNumber && transaction.installmentTotal) {
    const marker = new RegExp(
      `\\b0*${transaction.installmentNumber}\\s*(?:\\/|de|\\s+)\\s*0*${transaction.installmentTotal}\\b`,
      "gi",
    );
    text = text.replace(marker, " ");
  }

  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildInstallmentSeries(transactions: InstallmentTransaction[]) {
  const cyclesByKey = new Map<string, InstallmentSeries[]>();
  const sorted = [...transactions].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  );

  for (const transaction of sorted) {
    const number = transaction.installmentNumber;
    const total = transaction.installmentTotal;
    if (!number || !total || total < 2) continue;

    const key = [
      seriesDescription(transaction),
      transaction.domainAccountId ?? "all",
      total,
    ].join(":");
    const cycles = cyclesByKey.get(key) ?? [];

    let cycle =
      number > 1
        ? [...cycles]
            .reverse()
            .find(
              (candidate) =>
                candidate.transactions.at(-1)?.installmentNumber ===
                number - 1,
            )
        : undefined;

    if (!cycle) {
      cycle = {
        id: transaction.id,
        totalInstallments: total,
        transactions: [],
      };
      cycles.push(cycle);
      cyclesByKey.set(key, cycles);
    }

    cycle.totalInstallments = Math.max(cycle.totalInstallments, total);
    cycle.transactions.push(transaction);
  }

  return [...cyclesByKey.values()].flat();
}

function buildOccurrences(series: InstallmentSeries) {
  const occurrences: InstallmentOccurrence[] = series.transactions.map(
    (transaction) => ({
      date: transaction.occurredAt,
      amount: Math.abs(Number(transaction.amount)),
      number: transaction.installmentNumber ?? 0,
      projected: false,
      transaction,
    }),
  );
  const last = occurrences.at(-1);
  if (!last) return occurrences;

  for (
    let number = last.number + 1;
    number <= series.totalInstallments;
    number += 1
  ) {
    occurrences.push({
      date: addMonths(last.date, number - last.number),
      amount: last.amount,
      number,
      projected: true,
      transaction: last.transaction,
    });
  }

  return occurrences;
}

function amount(value: number | null | undefined) {
  return Math.abs(Number(value ?? 0));
}

function currency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: Request) {
  const referenceMonth = getReferenceMonth(request);
  const referenceMonthEnd = monthEnd(referenceMonth);

  // Re-detecta periodicamente (throttle interno) para captar transações
  // novas e mudanças de padrões de salário sem exigir banco zerado.
  await ensureRecurringDerivedFresh();

  const rules = await getRecurringPayload();
  const installmentTransactions = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      installmentTotal: { not: null },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
  const installmentSeries = buildInstallmentSeries(installmentTransactions);

  const categories = await prisma.domainCategory.findMany();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

  const merchantIds = Array.from(
    new Set([
      ...rules.map((rule) => rule.merchantId).filter(Boolean),
      ...installmentTransactions
        .map((transaction) => transaction.domainMerchantId)
        .filter(Boolean),
    ]),
  ) as string[];
  const merchants = await prisma.domainMerchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, displayName: true },
  });
  const merchantMap = new Map(
    merchants.map((merchant) => [merchant.id, merchant.displayName]),
  );
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

  const fixedRules = rules.filter((rule) => !rule.isInstallment);
  const mapped: RecurringRule[] = fixedRules.map((rule) => {
    const merchantName = rule.merchantId ? merchantMap.get(rule.merchantId) : null;
    return {
      id: rule.id,
      description: rule.title,
      amount: Number(rule.amount),
      currencyCode: rule.currencyCode ?? null,
      frequency: rule.interval,
      category: rule.categoryId
        ? (categoryMap.get(rule.categoryId) ?? "Sem categoria")
        : "Sem categoria",
      categoryId: rule.categoryId,
      nextDate: rule.nextDate.toISOString(),
      type: rule.type,
      occurrences: rule.occurrences ?? 0,
      lastDate: rule.lastOccurrenceAt?.toISOString() ?? null,
      confidence: rule.confidence ?? 0,
      isManual: rule.origin === "manual",
      origin: rule.origin as "detected" | "manual",
      merchantName: merchantName ?? null,
      logoUrl:
        (rule.merchantId ? merchantLogoMap.get(rule.merchantId) : null) ??
        getMerchantLogo(merchantName || rule.title),
      isInstallment: false,
    };
  });

  const seriesOccurrences = installmentSeries.map((series) => ({
    series,
    occurrences: buildOccurrences(series),
  }));

  const installmentMapped = seriesOccurrences.flatMap<
    RecurringRule & { dueInReferenceMonth: boolean; projectedNext: boolean }
  >(({ series, occurrences }) => {
    const dueThisMonth = occurrences.find((occurrence) =>
      sameMonth(occurrence.date, referenceMonth),
    );
    const nextDue = occurrences.find(
      (occurrence) => occurrence.date > referenceMonthEnd,
    );
    const displayedOccurrence = dueThisMonth ?? nextDue;
    if (!displayedOccurrence) return [];

    const latestDue = [...occurrences]
      .reverse()
      .find((occurrence) => occurrence.date <= referenceMonthEnd);
    const transaction = displayedOccurrence.transaction;
    const merchantName = transaction.domainMerchantId
      ? merchantMap.get(transaction.domainMerchantId)
      : transaction.merchantName;
    const description =
      merchantName ??
      transaction.description ??
      seriesDescription(transaction) ??
      "Parcela detectada";

    return [
      {
        id: `installment-${series.id}`,
        description,
        amount: displayedOccurrence.amount,
        currencyCode: transaction.currencyCode ?? null,
        frequency: "MONTHLY",
        category: transaction.domainCategoryId
          ? (categoryMap.get(transaction.domainCategoryId) ?? "Sem categoria")
          : "Sem categoria",
        categoryId: transaction.domainCategoryId,
        nextDate: displayedOccurrence.date.toISOString(),
        type: "EXPENSE",
        occurrences: series.totalInstallments,
        lastDate: occurrences.at(-1)?.date.toISOString() ?? null,
        confidence: 1,
        isManual: false,
        origin: "detected",
        merchantName: merchantName ?? null,
        logoUrl:
          (transaction.domainMerchantId
            ? merchantLogoMap.get(transaction.domainMerchantId)
            : null) ?? getMerchantLogo(description),
        isInstallment: true,
        currentInstallment: latestDue?.number ?? 0,
        totalInstallments: series.totalInstallments,
        installmentRemaining: Math.max(
          series.totalInstallments - (latestDue?.number ?? 0),
          0,
        ),
        dueInReferenceMonth: Boolean(dueThisMonth),
        projectedNext: displayedOccurrence.projected,
      },
    ];
  });

  const fixedMonthlyExpenses = currency(
    fixedRules
      .filter((rule) => rule.type === "EXPENSE")
      .reduce(
        (sum, rule) =>
          sum +
          monthlyEquivalentAmount(amount(Number(rule.amount)), rule.interval),
        0,
      ),
  );
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(referenceMonth.getUTCFullYear(), index, 1));
    const installments = currency(
      seriesOccurrences.reduce(
        (total, entry) =>
          total +
          entry.occurrences
            .filter((occurrence) => sameMonth(occurrence.date, month))
            .reduce((sum, occurrence) => sum + occurrence.amount, 0),
        0,
      ),
    );

    return {
      month: index + 1,
      fixed: fixedMonthlyExpenses,
      installments,
      total: currency(fixedMonthlyExpenses + installments),
    };
  });
  const selectedMonthTotals = monthlyTotals[referenceMonth.getUTCMonth()];

  const summary = {
    totalMonthlyExpenses: selectedMonthTotals?.total ?? fixedMonthlyExpenses,
    fixedMonthlyExpenses,
    installmentMonthlyExpenses: selectedMonthTotals?.installments ?? 0,
    totalMonthlyIncome: currency(
      fixedRules
        .filter((rule) => rule.type === "INCOME")
        .reduce(
          (sum, rule) =>
            sum +
            monthlyEquivalentAmount(amount(Number(rule.amount)), rule.interval),
          0,
        ),
    ),
    count: mapped.length + installmentMapped.length,
    referenceMonth: referenceMonth.toISOString(),
  };

  return NextResponse.json(
    serializeForJson({
      rules: [...mapped, ...installmentMapped],
      summary,
      monthlyTotals,
    }),
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validation = validateManualRecurringInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const rule = await createManualRecurringRule(validation.input);
  return NextResponse.json(serializeForJson(rule), { status: 201 });
}
