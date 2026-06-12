import { DomainTransactionDirection, Prisma } from "@prisma/client";

import { parseNumberParam } from "@/lib/core/filters";
import { RECURRING_DETECTION, PROJECTION } from "@/lib/domain/constants";
import {
  classifyCashFlowTransaction,
  getCashFlowMetrics,
  getCryptoPortfolioMetrics,
  getOverviewMetrics,
} from "@/lib/domain/analytics";
import { getUserSettings } from "@/lib/domain/queries";
import { prisma } from "@/lib/prisma";

const ZERO = new Prisma.Decimal(0);
const MS_IN_DAY = 24 * 60 * 60 * 1000;

type DecimalLike = Prisma.Decimal | null | undefined;

type RecurringRuleOrigin = "detected" | "manual";

type RecurringMetadata = {
  origin?: RecurringRuleOrigin;
  confidence?: number;
  nextDate?: string;
  accountId?: string | null;
  occurrences?: number;
  lastOccurrenceAt?: string | null;
  direction?: string | null;
  sourceTransactionIds?: string[];
  isInstallment?: boolean;
};

function decimal(value?: DecimalLike) {
  return value ?? ZERO;
}

function sumDecimals(values: DecimalLike[]) {
  return values.reduce(
    (total: Prisma.Decimal, current) => total.plus(decimal(current)),
    ZERO,
  );
}

function parseMetadata(value?: string | null): RecurringMetadata {
  if (!value) return {};
  try {
    return JSON.parse(value) as RecurringMetadata;
  } catch {
    return {};
  }
}

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

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() ?? null
  );
}

function normalizeCategoryLookup(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() ?? ""
  );
}

function normalizePatternLookup(value?: string | null) {
  return normalizeCategoryLookup(value)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSalaryCategory(category: { slug?: string | null; name?: string | null }) {
  const lookup = `${normalizeCategoryLookup(category.slug)} ${normalizeCategoryLookup(category.name)}`;
  return (
    lookup.includes("seed-salary") ||
    lookup.includes("salario") ||
    lookup.includes("salary")
  );
}

function safeNumber(value: Prisma.Decimal) {
  return Number(value.toString());
}

function parseOccurrenceDate(ruleDate?: string) {
  if (!ruleDate) return null;
  const parsed = new Date(ruleDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function occurrenceForMonth(nextDate: Date, monthStart: Date) {
  const monthDelta =
    (monthStart.getUTCFullYear() - nextDate.getUTCFullYear()) * 12 +
    (monthStart.getUTCMonth() - nextDate.getUTCMonth());
  if (monthDelta < 0) return null;
  return addMonths(nextDate, monthDelta);
}

function isLoanActive(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  return (
    !normalized ||
    !["PAID", "SETTLED", "CLOSED", "CANCELLED"].includes(normalized)
  );
}

export async function refreshRecurringDerived(options?: {
  lookbackDays?: number;
  minOccurrences?: number;
}) {
  const lookbackDays = options?.lookbackDays ?? 365;
  const minOccurrences = options?.minOccurrences ?? 3;
  const lookbackFrom = new Date(Date.now() - lookbackDays * MS_IN_DAY);

  const [transactions, categories, existingRules] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        occurredAt: { gte: lookbackFrom },
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.domainCategory.findMany(),
    prisma.domainRecurringRule.findMany(),
  ]);

  const categoryMap = new Map<string, (typeof categories)[number]>(
    categories.map((category) => [category.id, category]),
  );
  const groups = new Map<string, typeof transactions>();

  for (const transaction of transactions) {
    if (transaction.installmentGroupId || transaction.installmentTotal)
      continue;

    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null;

    const classification = classifyCashFlowTransaction(
      transaction.direction,
      category?.name,
      category?.kind,
      transaction.description ?? transaction.normalizedDescription,
    );
    if (classification === "excluded" || classification === "investment") {
      continue;
    }

    const normalizedDescription =
      transaction.normalizedDescription ??
      normalizeText(transaction.description);
    const candidateKey =
      transaction.domainMerchantId ??
      normalizedDescription ??
      transaction.merchantName ??
      transaction.description;

    if (!candidateKey) continue;

    const isSalary = category ? isSalaryCategory(category) : false;
    const groupingKey = isSalary ? "salary_group" : (transaction.domainMerchantId ?? candidateKey);

    const key = [
      transaction.direction,
      groupingKey,
      transaction.domainAccountId ?? "all",
    ].join(":");

    const current = groups.get(key) ?? [];
    current.push(transaction);
    groups.set(key, current);
  }

  const detectedCandidates = [] as Array<{
    name: string;
    merchantId?: string;
    categoryId?: string;
    descriptionPattern?: string;
    amount: Prisma.Decimal;
    interval: string;
    nextDate: Date;
    type: "INCOME" | "EXPENSE";
    accountId?: string | null;
    confidence: number;
    occurrences: number;
    lastOccurrenceAt: Date;
    sourceTransactionIds: string[];
    isInstallment?: boolean;
  }>;

  for (const [key, group] of groups.entries()) {
    const isSalaryGroup = key.includes("salary_group");
    const requiredOccurrences = isSalaryGroup ? 1 : minOccurrences;

    if (group.length < requiredOccurrences) continue;

    const sorted = [...group].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );
    const intervals = sorted.slice(1).map((current, index) => {
      const previous = sorted[index];
      return (
        (current.occurredAt.getTime() - previous.occurredAt.getTime()) /
        MS_IN_DAY
      );
    });

    const avgIntervalDays =
      intervals.reduce((total, current) => total + current, 0) /
      Math.max(intervals.length, 1);

    let detectedInterval: string | null = null;
    const { INTERVAL_THRESHOLDS } = RECURRING_DETECTION;
    
    if (isSalaryGroup && group.length === 1) {
      detectedInterval = "MONTHLY";
    } else {
      if (avgIntervalDays >= INTERVAL_THRESHOLDS.WEEKLY.min && avgIntervalDays <= INTERVAL_THRESHOLDS.WEEKLY.max)
        detectedInterval = "WEEKLY";
      else if (avgIntervalDays >= INTERVAL_THRESHOLDS.BIWEEKLY.min && avgIntervalDays <= INTERVAL_THRESHOLDS.BIWEEKLY.max)
        detectedInterval = "BIWEEKLY";
      else if (avgIntervalDays >= INTERVAL_THRESHOLDS.MONTHLY.min && avgIntervalDays <= INTERVAL_THRESHOLDS.MONTHLY.max)
        detectedInterval = "MONTHLY";
      else if (avgIntervalDays >= INTERVAL_THRESHOLDS.QUARTERLY.min && avgIntervalDays <= INTERVAL_THRESHOLDS.QUARTERLY.max)
        detectedInterval = "QUARTERLY";
      else if (avgIntervalDays >= INTERVAL_THRESHOLDS.YEARLY.min && avgIntervalDays <= INTERVAL_THRESHOLDS.YEARLY.max)
        detectedInterval = "YEARLY";
    }

    if (!detectedInterval) continue;

    const amounts = sorted.map((transaction) =>
      Math.abs(safeNumber(transaction.amount)),
    );
    const avgAmountNumber =
      amounts.reduce((total, current) => total + current, 0) / amounts.length;
    const maxDeviation = Math.max(
      ...amounts.map((amount) => Math.abs(amount - avgAmountNumber)),
    );

    if (maxDeviation > Math.max(RECURRING_DETECTION.AMOUNT_DEVIATION_FIXED, avgAmountNumber * RECURRING_DETECTION.AMOUNT_DEVIATION_PCT)) continue;

    const lastTransaction = sorted.at(-1);
    if (!lastTransaction) continue;

    const { CONFIDENCE } = RECURRING_DETECTION;
    const confidence = Math.min(
      CONFIDENCE.MAX,
      CONFIDENCE.BASE +
        Math.min(sorted.length, CONFIDENCE.MAX_OCCURRENCES_FOR_SCORE) * CONFIDENCE.PER_OCCURRENCE +
        (1 - maxDeviation / Math.max(avgAmountNumber, 1)) * CONFIDENCE.PER_DEVIATION,
    );

    let nextDate = new Date(lastTransaction.occurredAt);
    if (detectedInterval === "WEEKLY")
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    else if (detectedInterval === "BIWEEKLY")
      nextDate.setUTCDate(nextDate.getUTCDate() + 14);
    else if (detectedInterval === "MONTHLY") nextDate = addMonths(nextDate, 1);
    else if (detectedInterval === "QUARTERLY")
      nextDate = addMonths(nextDate, 3);
    else if (detectedInterval === "YEARLY")
      nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);

    detectedCandidates.push({
      name:
        lastTransaction.merchantName ??
        lastTransaction.description ??
        "Detected recurrence",
      merchantId: lastTransaction.domainMerchantId ?? undefined,
      categoryId: lastTransaction.domainCategoryId ?? undefined,
      descriptionPattern:
        lastTransaction.normalizedDescription ??
        normalizeText(lastTransaction.description) ??
        undefined,
      amount: new Prisma.Decimal(avgAmountNumber.toFixed(2)),
      interval: detectedInterval,
      nextDate: nextDate,
      type:
        lastTransaction.direction === DomainTransactionDirection.INFLOW
          ? "INCOME"
          : "EXPENSE",
      accountId: lastTransaction.domainAccountId,
      confidence,
      occurrences: sorted.length,
      lastOccurrenceAt: lastTransaction.occurredAt,
      sourceTransactionIds: sorted.slice(-6).map((item) => item.id),
      isInstallment: false,
    });
  }

  const autoDetectedIds = existingRules
    .filter((rule) => parseMetadata(rule.metadataJson).origin === "detected")
    .map((rule) => rule.id);

  if (autoDetectedIds.length > 0) {
    await prisma.domainRecurringRule.deleteMany({
      where: { id: { in: autoDetectedIds } },
    });
  }

  for (const candidate of detectedCandidates) {
    await prisma.domainRecurringRule.create({
      data: {
        name: candidate.name,
        merchantId: candidate.merchantId,
        categoryId: candidate.categoryId,
        descriptionPattern: candidate.descriptionPattern,
        amount: candidate.amount,
        interval: candidate.interval,
        active: true,
        metadataJson: JSON.stringify({
          origin: "detected",
          confidence: candidate.confidence,
          nextDate: candidate.nextDate.toISOString(),
          accountId: candidate.accountId,
          occurrences: candidate.occurrences,
          lastOccurrenceAt: candidate.lastOccurrenceAt.toISOString(),
          direction: candidate.type,
          sourceTransactionIds: candidate.sourceTransactionIds,
          isInstallment: candidate.isInstallment ?? false,
        } satisfies RecurringMetadata),
      },
    });
  }

  return {
    lookbackDays,
    minOccurrences,
    detected: detectedCandidates.length,
    preservedManual: existingRules.length - autoDetectedIds.length,
  };
}

export async function getRecurringPayload(type?: "INCOME" | "EXPENSE") {
  const rules = await prisma.domainRecurringRule.findMany({
    where: {
      active: true,
      metadataJson: type
        ? {
            contains: `"direction":"${type}"`,
          }
        : undefined,
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return rules
    .map((rule) => {
      const metadata = parseMetadata(rule.metadataJson);
      const nextDate =
        parseOccurrenceDate(metadata.nextDate) ?? addMonths(new Date(), 1);
      const recurringType =
        metadata.direction === "INCOME" || metadata.direction === "EXPENSE"
          ? metadata.direction
          : "EXPENSE";

      return {
        id: rule.id,
        title: rule.name,
        type: recurringType,
        amount: rule.amount,
        interval: rule.interval ?? "MONTHLY",
        nextDate,
        active: rule.active,
        accountId: metadata.accountId ?? null,
        merchantId: rule.merchantId,
        categoryId: rule.categoryId,
        descriptionPattern: rule.descriptionPattern,
        confidence: metadata.confidence ?? null,
        origin: metadata.origin ?? "manual",
        occurrences: metadata.occurrences ?? null,
        lastOccurrenceAt: metadata.lastOccurrenceAt
          ? new Date(metadata.lastOccurrenceAt)
          : null,
        isInstallment: metadata.isInstallment ?? false,
      };
    })
    .filter((rule) => (type ? rule.type === type : true))
    .sort((left, right) => left.nextDate.getTime() - right.nextDate.getTime());
}

export async function getProjectionPayload(searchParams?: URLSearchParams) {
  const horizonMonths = Math.min(
    Math.max(parseNumberParam(searchParams?.get("months") ?? null, PROJECTION.DEFAULT_MONTHS) ?? PROJECTION.DEFAULT_MONTHS, PROJECTION.MIN_MONTHS),
    PROJECTION.MAX_MONTHS,
  );
  const includeVariableExpenses =
    searchParams?.get("includeVariableExpenses") !== "false";

  const now = new Date();
  const lookbackFrom = new Date(now.getTime() - PROJECTION.VARIABLE_EXPENSE_LOOKBACK_DAYS * MS_IN_DAY);

  const [
    overview,
    recurringRules,
    bills,
    pastTransactions,
    categories,
    settings,
    scenarioEvents,
  ] = await Promise.all([
    getOverviewMetrics(new URLSearchParams("period=all")),
    getRecurringPayload(),
    prisma.domainBill.findMany({
      where: {
        dueDate: {
          gte: now,
        },
      },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        occurredAt: { gte: lookbackFrom },
      },
    }),
    prisma.domainCategory.findMany(),
    getUserSettings(searchParams),
    prisma.domainScenarioEvent.findMany({
      where: { isActive: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const categoryMap = new Map<string, (typeof categories)[number]>(
    categories.map((category) => [category.id, category]),
  );
  const salaryCategoryIds = new Set(
    categories.filter(isSalaryCategory).map((category) => category.id),
  );
  const salaryPatterns = settings.salaryPatterns
    .map(normalizePatternLookup)
    .filter(Boolean);
  const matchesSalaryPattern = (...values: Array<string | null | undefined>) => {
    if (salaryPatterns.length === 0) return false;
    const lookup = normalizePatternLookup(values.filter(Boolean).join(" "));
    if (!lookup) return false;
    return salaryPatterns.some(
      (pattern) => lookup.includes(pattern) || pattern.includes(lookup),
    );
  };
  const EXCLUDED_SPENDING_CATEGORIES = new Set([
    "pagamento de cartão de crédito",
    "transferência mesma titularidade",
    "transferência entre contas",
    "pagamento de fatura",
  ]);

  const variableTransactions = pastTransactions.filter((tx) => {
    if (tx.direction !== DomainTransactionDirection.OUTFLOW) return false;
    if (tx.installmentGroupId || tx.installmentTotal) return false;

    const cat = tx.domainCategoryId
      ? categoryMap.get(tx.domainCategoryId)
      : null;
    if (cat?.kind === "TRANSFER") return false;
    if (cat?.name && EXCLUDED_SPENDING_CATEGORIES.has(cat.name.toLowerCase()))
      return false;

    const isRecurring = recurringRules.some((rule) => {
      if (rule.type === "INCOME") return false;
      if (rule.isInstallment) return false;
      if (rule.merchantId && rule.merchantId === tx.domainMerchantId)
        return true;
      if (rule.descriptionPattern) {
        const normalized =
          tx.normalizedDescription ?? normalizeText(tx.description);
        if (normalized?.includes(rule.descriptionPattern.toLowerCase()))
          return true;
      }
      return false;
    });

    return !isRecurring;
  });

  const totalVariableOutflow = sumDecimals(
    variableTransactions.map((tx) => tx.amount.abs()),
  );
  const avgVariableExpenses = includeVariableExpenses
    ? safeNumber(totalVariableOutflow.div(3))
    : 0;

  let currentBalance = overview.accountBalance;
  const monthsData = [] as Array<{
    month: number;
    year: number;
    label: string;
    knownIncome: number;
    estimatedSalary: number;
    income: number;
    scenarioAdjustments: number;
    recurringExpenses: number;
    installments: number;
    variableExpenses: number;
    projected: number;
    balance: number;
    startingBalance: number;
  }>;

  for (let index = 1; index <= horizonMonths; index += 1) {
    const pointDate = startOfMonth(addMonths(now, index));
    const pointMonthEnd = endOfMonth(pointDate);
    const startingBalance = currentBalance;

    let recurringInflow = ZERO;
    let salaryRecurringInflow = ZERO;
    let recurringOutflow = ZERO;
    let installmentsOutflow = ZERO;

    // 1. Recurring Rules
    for (const rule of recurringRules) {
      if (!rule.active) continue;
      const nextDate = rule.nextDate;
      const occurrenceDate = occurrenceForMonth(nextDate, pointDate);
      if (!occurrenceDate) continue;
      if (occurrenceDate < pointDate || occurrenceDate > pointMonthEnd)
        continue;

      if (rule.type === "INCOME") {
        const incomeAmount = decimal(rule.amount);
        recurringInflow = recurringInflow.plus(incomeAmount);
        if (
          (rule.categoryId && salaryCategoryIds.has(rule.categoryId)) ||
          matchesSalaryPattern(rule.title, rule.descriptionPattern)
        ) {
          salaryRecurringInflow = salaryRecurringInflow.plus(incomeAmount);
        }
      } else if (rule.isInstallment) {
        if (settings.showFutureAccounts) {
          installmentsOutflow = installmentsOutflow.plus(
            decimal(rule.amount).abs(),
          );
        }
      } else {
        recurringOutflow = recurringOutflow.plus(decimal(rule.amount).abs());
      }
    }

    // 2. Bills
    const monthlyBills = settings.showFutureAccounts
      ? bills.filter(
          (bill) =>
            bill.dueDate &&
            bill.dueDate >= pointDate &&
            bill.dueDate <= pointMonthEnd,
        )
      : [];
    const billsOutflow = sumDecimals(
      monthlyBills.map((bill) => bill.totalAmount),
    ).abs();
    const billAccountIds = new Set(
      monthlyBills
        .map((bill) => bill.domainAccountId)
        .filter((accountId): accountId is string => Boolean(accountId)),
    );

    // 3. Smart Installment Detection (from persisted installment fields).
    const detectedInstallments = settings.showFutureAccounts
      ? pastTransactions.filter((tx) => {
          if (tx.direction !== DomainTransactionDirection.OUTFLOW) return false;
          if (tx.domainAccountId && billAccountIds.has(tx.domainAccountId)) {
            return false;
          }
          const current = tx.installmentNumber ?? null;
          const total = tx.installmentTotal ?? null;
          if (!current || !total) return false;
          if (current >= total) return false;

          const txDate = new Date(tx.occurredAt);
          const monthsSinceTx =
            (pointDate.getUTCFullYear() - txDate.getUTCFullYear()) * 12 +
            (pointDate.getUTCMonth() - txDate.getUTCMonth());

          const projectedInstallmentNumber = current + monthsSinceTx;
          return projectedInstallmentNumber <= total;
        })
      : [];

    const smartInstallmentsOutflow = sumDecimals(
      detectedInstallments.map((tx) => tx.amount.abs()),
    );

    // 4. Future Transactions (Manual or scheduled)
    const futureTransactions = pastTransactions.filter(
      (tx) =>
        !tx.installmentGroupId &&
        !tx.installmentTotal &&
        tx.occurredAt >= pointDate &&
        tx.occurredAt <= pointMonthEnd,
    );
    const futureInflow = sumDecimals(
      futureTransactions
        .filter((tx) => tx.direction === "INFLOW")
        .map((tx) => tx.amount),
    );
    const futureSalaryInflow = sumDecimals(
      futureTransactions
        .filter(
          (tx) =>
            tx.direction === "INFLOW" &&
            ((tx.domainCategoryId &&
              salaryCategoryIds.has(tx.domainCategoryId)) ||
              matchesSalaryPattern(
                tx.description,
                tx.normalizedDescription,
                tx.merchantName,
              )),
        )
        .map((tx) => tx.amount.abs()),
    );
    const futureOutflow = sumDecimals(
      futureTransactions
        .filter((tx) => tx.direction === "OUTFLOW")
        .map((tx) => tx.amount.abs()),
    );

    const configuredSalary = new Prisma.Decimal(settings.monthlySalary);
    const salaryTopUp = configuredSalary
      .minus(salaryRecurringInflow)
      .minus(futureSalaryInflow);
    const salaryIncome =
      settings.showFutureSalary &&
      configuredSalary.greaterThan(0) &&
      salaryTopUp.greaterThan(0)
        ? salaryTopUp
        : ZERO;
    const knownIncome = recurringInflow.plus(futureInflow);
    const income = safeNumber(knownIncome.plus(salaryIncome));
    const scenarioAdjustments = safeNumber(
      sumDecimals(
        scenarioEvents
          .filter((event) => {
            if (event.isRecurring) {
              return event.date <= pointMonthEnd;
            }
            return event.date >= pointDate && event.date <= pointMonthEnd;
          })
          .map((event) => event.amount),
      ),
    );
    const recurringExpenses = safeNumber(recurringOutflow);
    const installments = safeNumber(
      installmentsOutflow.plus(billsOutflow).plus(smartInstallmentsOutflow),
    );
    const variableExpenses = avgVariableExpenses;
    const knownFutureOutflow = safeNumber(futureOutflow);

    const totalOutflow =
      recurringExpenses + installments + variableExpenses + knownFutureOutflow;
    const monthlyNet = income + scenarioAdjustments - totalOutflow;
    const monthlyNetDecimal = new Prisma.Decimal(monthlyNet.toFixed(2));
    currentBalance = startingBalance.plus(monthlyNetDecimal);

    monthsData.push({
      month: pointDate.getUTCMonth() + 1,
      year: pointDate.getUTCFullYear(),
      label: monthKey(pointDate),
      knownIncome: safeNumber(knownIncome),
      estimatedSalary: safeNumber(salaryIncome),
      income,
      scenarioAdjustments,
      recurringExpenses,
      installments,
      variableExpenses: variableExpenses + knownFutureOutflow,
      projected: safeNumber(monthlyNetDecimal),
      balance: safeNumber(currentBalance),
      startingBalance: safeNumber(startingBalance),
    });
  }

  // Compute average monthly income from real past transaction inflows (3-month window)
  // so the summary card reflects actual income even when salary is not configured.
  const pastInflowTransactions = pastTransactions.filter((tx) => {
    if (tx.direction !== DomainTransactionDirection.INFLOW) return false;
    const cat = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null;
    const classification = classifyCashFlowTransaction(
      tx.direction,
      cat?.name,
      cat?.kind,
      tx.description ?? tx.normalizedDescription,
    );
    return classification === "income";
  });
  const totalPastInflow = safeNumber(
    sumDecimals(pastInflowTransactions.map((tx) => tx.amount.abs())),
  );
  const lookbackMonths = PROJECTION.VARIABLE_EXPENSE_LOOKBACK_DAYS / 30;
  const avgRealMonthlyInflow = totalPastInflow / lookbackMonths;

  const averageMonthlyIncome =
    monthsData.length > 0
      ? Math.max(
          avgRealMonthlyInflow,
          monthsData.reduce((sum, month) => sum + month.income, 0) / monthsData.length,
        )
      : avgRealMonthlyInflow;
  const averageMonthlyExpenses =
    monthsData.length > 0
      ? monthsData.reduce(
          (sum, month) =>
            sum + month.recurringExpenses + month.installments + month.variableExpenses,
          0,
        ) / monthsData.length
      : 0;

  return {
    summary: {
      averageMonthlyIncome,
      averageMonthlyExpenses,
      projectedSavings: safeNumber(
        currentBalance.minus(overview.accountBalance),
      ),
    },
    months: monthsData,
  };
}

export async function getPortfolioPayload() {
  const [overview, accounts, investments, crypto, loans, recurring, history] =
    await Promise.all([
      getOverviewMetrics(new URLSearchParams("period=all")),
      prisma.domainAccount.findMany({
        orderBy: [{ kind: "asc" }, { balance: "desc" }],
      }),
      prisma.domainInvestment.findMany({
        orderBy: [{ balance: "desc" }, { name: "asc" }],
      }),
      getCryptoPortfolioMetrics(new URLSearchParams("period=all")),
      prisma.pluggyLoanRecord.findMany({
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      }),
      getRecurringPayload(),
      buildPortfolioHistory(12),
    ]);

  const activeLoans = loans.filter((loan) => isLoanActive(loan.status));
  const loanBalance = sumDecimals(
    activeLoans.map((loan) => loan.contractAmount),
  );
  const liabilitiesTotal = overview.liabilitiesTotal;

  return {
    summary: {
      liquidAssets: overview.accountBalance,
      investments: overview.investmentsTotal,
      crypto: overview.cryptoTotal,
      openBills: overview.openBills,
      loans: loanBalance,
      liabilitiesTotal,
      grossAssets: overview.accountBalance
        .plus(overview.investmentsTotal)
        .plus(overview.cryptoTotal),
      netWorth: overview.accountBalance
        .plus(overview.investmentsTotal)
        .plus(overview.cryptoTotal)
        .minus(liabilitiesTotal),
      recurringIncome: sumDecimals(
        recurring
          .filter((rule) => rule.type === "INCOME")
          .map((rule) => rule.amount),
      ),
      recurringExpense: sumDecimals(
        recurring
          .filter((rule) => rule.type === "EXPENSE")
          .map((rule) => rule.amount),
      ),
    },
    accounts,
    investments,
    crypto,
    loans: activeLoans,
    recurring,
    history,
  };
}

export async function buildPortfolioHistory(months = 12) {
  const now = new Date();
  const { netWorth } = await getOverviewMetrics(
    new URLSearchParams("period=all"),
  );
  const cashFlow = await getCashFlowMetrics(
    new URLSearchParams(`period=${months}m&groupBy=month`),
  );

  const bucketMap = new Map(cashFlow.map((point) => [point.period, point.net]));
  const monthsList = [] as Date[];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    monthsList.push(startOfMonth(addMonths(now, -offset)));
  }

  const points = monthsList.map((date) => {
    const futureMonths = monthsList.filter((current) => current > date);
    const rollback = sumDecimals(
      futureMonths.map((month) => bucketMap.get(monthKey(month))),
    );

    return {
      date,
      netWorth: netWorth.minus(rollback),
      source: "derived",
    };
  });

  return points;
}

export async function refreshDerivedCaches() {
  const recurringSummary = await refreshRecurringDerived();
  const [portfolioHistory, projection] = await Promise.all([
    buildPortfolioHistory(12),
    getProjectionPayload(new URLSearchParams("months=6")),
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.portfolioSnapshot.deleteMany();
    if (portfolioHistory.length > 0) {
      await tx.portfolioSnapshot.createMany({
        data: portfolioHistory.map((point) => ({
          date: point.date,
          netWorth: point.netWorth,
        })),
      });
    }

    await tx.balanceProjection.deleteMany();
    if (projection.months.length > 0) {
      await tx.balanceProjection.createMany({
        data: projection.months.map((month) => ({
          date: new Date(
            `${month.year}-${String(month.month).padStart(2, "0")}-01T00:00:00Z`,
          ),
          projectedBalance: new Prisma.Decimal(month.balance.toFixed(2)),
        })),
      });
    }
  });

  return {
    recurring: recurringSummary,
    portfolioSnapshots: portfolioHistory.length,
    projections: projection.months.length,
  };
}

export async function getDashboardRecurring() {
  const rules = await getRecurringPayload("EXPENSE");
  const categories = await prisma.domainCategory.findMany();
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
  const merchantIds = rules
    .map((rule) => rule.merchantId)
    .filter(Boolean) as string[];
  const merchants = await prisma.domainMerchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, displayName: true },
  });
  const merchantMap = new Map(merchants.map((merchant) => [merchant.id, merchant.displayName]));
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

  const mapped = rules.map((rule) => ({
    id: rule.id,
    description: rule.title,
    amount: rule.amount,
    frequency: rule.interval,
    category: rule.categoryId
      ? (categoryMap.get(rule.categoryId) ?? "Sem categoria")
      : "Sem categoria",
    categoryId: rule.categoryId,
    nextDate: rule.nextDate,
    type: rule.type,
    occurrences: rule.occurrences ?? 0,
    lastDate: rule.lastOccurrenceAt,
    confidence: rule.confidence ?? 0,
    isManual: rule.origin === "manual",
    origin: rule.origin,
    merchantName: rule.merchantId ? merchantMap.get(rule.merchantId) : null,
    logoUrl: rule.merchantId ? (merchantLogoMap.get(rule.merchantId) ?? null) : null,
    isInstallment: rule.isInstallment ?? false,
  }));

  const total = rules.reduce((sum, rule) => sum + Math.abs(Number(rule.amount)), 0);

  return {
    rules: mapped,
    summary: {
      totalMonthly: total,
    },
  };
}
