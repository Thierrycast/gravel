import { DomainTransactionDirection, Prisma } from "@prisma/client";

import { parseNumberParam } from "@/lib/core/filters";
import { RECURRING_DETECTION, PROJECTION } from "@/lib/domain/constants";
import {
  classifyCashFlowTransaction,
  getCashFlowMetrics,
  getCryptoPortfolioMetrics,
  getOverviewMetrics,
} from "@/lib/domain/analytics";
import { getCardStatements } from "@/lib/domain/billing";
import {
  occurrenceDatesInMonth,
  ruleSuppressionKeys,
} from "@/lib/domain/recurring";
import { getUserSettings } from "@/lib/domain/queries";
import { matchesSalaryPatternValues } from "@/lib/domain/salary";
import { prisma } from "@/lib/prisma";

const ZERO = new Prisma.Decimal(0);
const MS_IN_DAY = 24 * 60 * 60 * 1000;

type DecimalLike = Prisma.Decimal | null | undefined;

type RecurringRuleOrigin = "detected" | "manual" | "dismissed";

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
  currencyCode?: string | null;
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

function isLoanActive(status?: string | null) {
  const normalized = status?.trim().toUpperCase();
  return (
    !normalized ||
    !["PAID", "SETTLED", "CLOSED", "CANCELLED"].includes(normalized)
  );
}

// Timestamp (por processo) da última detecção de recorrências. A detecção é
// idempotente (recria só as regras "detected"), mas custa uma varredura de 365
// dias de transações — o throttle evita rodá-la a cada GET.
let lastRecurringRefreshAt = 0;

export async function ensureRecurringDerivedFresh(options?: {
  maxAgeMs?: number;
  force?: boolean;
}) {
  const maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000;
  if (!options?.force && Date.now() - lastRecurringRefreshAt < maxAgeMs) {
    return false;
  }
  await refreshRecurringDerived();
  lastRecurringRefreshAt = Date.now();
  return true;
}

export async function refreshRecurringDerived(options?: {
  lookbackDays?: number;
  minOccurrences?: number;
}) {
  const lookbackDays = options?.lookbackDays ?? 365;
  const minOccurrences = options?.minOccurrences ?? 3;
  const lookbackFrom = new Date(Date.now() - lookbackDays * MS_IN_DAY);

  const [transactions, categories, existingRules, userSettings, accounts] =
    await Promise.all([
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          occurredAt: { gte: lookbackFrom },
        },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      }),
      prisma.domainCategory.findMany(),
      prisma.domainRecurringRule.findMany(),
      getUserSettings(),
      prisma.domainAccount.findMany({ select: { id: true, kind: true } }),
    ]);
  const salaryPatterns = userSettings.salaryPatterns ?? [];
  // Entradas em cartão de crédito são pagamento de fatura/estorno, nunca
  // renda recorrente ("Pagamento Recebido" estava virando receita).
  const cardAccountIds = new Set(
    accounts
      .filter((account) => account.kind?.toUpperCase().includes("CARD"))
      .map((account) => account.id),
  );

  const categoryMap = new Map<string, (typeof categories)[number]>(
    categories.map((category) => [category.id, category]),
  );
  const groups = new Map<string, typeof transactions>();

  for (const transaction of transactions) {
    if (transaction.installmentGroupId || transaction.installmentTotal)
      continue;
    if (
      transaction.direction === DomainTransactionDirection.INFLOW &&
      transaction.domainAccountId &&
      cardAccountIds.has(transaction.domainAccountId)
    )
      continue;

    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null;

    const classification = classifyCashFlowTransaction(
      transaction.direction,
      category?.name,
      category?.kind,
      transaction.description ?? transaction.normalizedDescription,
      { salaryPatterns, merchantName: transaction.merchantName },
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

    // Padrões de salário do usuário também formam o grupo de salário (que
    // detecta com 1 ocorrência) — cobre salário categorizado como
    // transferência pelo provedor.
    const isSalary =
      (category ? isSalaryCategory(category) : false) ||
      (transaction.direction === DomainTransactionDirection.INFLOW &&
        matchesSalaryPatternValues(
          [
            transaction.description,
            transaction.normalizedDescription,
            transaction.merchantName,
          ],
          salaryPatterns,
        ));
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
    currencyCode?: string | null;
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

    let sorted = [...group].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
    );

    // Grupo de salário: o padrão do usuário pode casar também transferências
    // próprias menores no mesmo mês. Mantém só a maior entrada de cada mês
    // (o salário), evitando que intervalos/valores irregulares descartem a
    // detecção.
    if (isSalaryGroup && sorted.length > 1) {
      const largestByMonth = new Map<string, (typeof sorted)[number]>();
      for (const transaction of sorted) {
        const monthOfTx = `${transaction.occurredAt.getUTCFullYear()}-${transaction.occurredAt.getUTCMonth()}`;
        const current = largestByMonth.get(monthOfTx);
        if (
          !current ||
          transaction.amount.abs().greaterThan(current.amount.abs())
        ) {
          largestByMonth.set(monthOfTx, transaction);
        }
      }
      sorted = [...largestByMonth.values()].sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      );
    }

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
    
    if (isSalaryGroup) {
      // Salário no Brasil é mensal; após reduzir à maior entrada por mês,
      // não depende dos thresholds de intervalo.
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
    // Mediana para salário: meses sem salário (só uma transferência pequena
    // casando o padrão) não puxam a média para baixo.
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
    const avgAmountNumber = isSalaryGroup
      ? medianAmount
      : amounts.reduce((total, current) => total + current, 0) /
        amounts.length;
    const maxDeviation = Math.max(
      ...amounts.map((amount) => Math.abs(amount - avgAmountNumber)),
    );

    // Salário pode variar (bônus, reajuste); não descarta por desvio.
    if (
      !isSalaryGroup &&
      maxDeviation >
        Math.max(
          RECURRING_DETECTION.AMOUNT_DEVIATION_FIXED,
          avgAmountNumber * RECURRING_DETECTION.AMOUNT_DEVIATION_PCT,
        )
    )
      continue;

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
      currencyCode: lastTransaction.currencyCode ?? null,
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

  // Não recria regras que o usuário gerencia manualmente ou descartou.
  const suppressedKeys = new Set(
    existingRules
      .filter((rule) => {
        const origin = parseMetadata(rule.metadataJson).origin;
        return origin === "manual" || origin === "dismissed";
      })
      .flatMap((rule) => ruleSuppressionKeys(rule)),
  );
  const survivingCandidates = detectedCandidates.filter((candidate) => {
    const direction = candidate.type;
    if (
      candidate.merchantId &&
      suppressedKeys.has(`merchant:${direction}:${candidate.merchantId}`)
    )
      return false;
    if (
      candidate.descriptionPattern &&
      suppressedKeys.has(
        `pattern:${direction}:${candidate.descriptionPattern.toLowerCase()}`,
      )
    )
      return false;
    return true;
  });

  for (const candidate of survivingCandidates) {
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
          currencyCode: candidate.currencyCode ?? null,
        } satisfies RecurringMetadata),
      },
    });
  }

  return {
    lookbackDays,
    minOccurrences,
    detected: survivingCandidates.length,
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
        currencyCode: metadata.currencyCode ?? null,
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
    cardStatements,
    activeGoals,
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
    getCardStatements({ now }),
    prisma.goal.findMany({ where: { active: true } }),
  ]);

  // Compromisso mensal com metas ativas ainda não concluídas. Os aportes não
  // saem das contas (o dinheiro continua no saldo), então NÃO entram como
  // despesa da projeção — mas o resumo expõe o valor para o insight
  // "sobra projetada vs metas".
  const goalCommitmentMonthly = safeNumber(
    sumDecimals(
      activeGoals
        .filter((goal) =>
          decimal(goal.currentAmount).lessThan(decimal(goal.targetAmount)),
        )
        .map((goal) => decimal(goal.monthlyContribution).abs()),
    ),
  );
  const goalCommitmentCount = activeGoals.filter(
    (goal) =>
      decimal(goal.currentAmount).lessThan(decimal(goal.targetAmount)) &&
      decimal(goal.monthlyContribution).greaterThan(0),
  ).length;

  // Cartões com ciclo de fatura configurado usam o motor de faturas como
  // fonte única de saídas futuras (fatura atual + próximas, no vencimento).
  // Isso substitui, para esses cartões, as heurísticas antigas (DomainBill
  // futuro, parcelas detectadas e regras de parcelamento) e elimina a dupla
  // contagem entre elas.
  const configuredCards = cardStatements.filter((card) => card.configured);
  const configuredCardIds = new Set(
    configuredCards.map((card) => card.accountId),
  );
  const statementOutflowByMonth = new Map<string, number>();
  let overdueStatementsOutflow = 0;
  let currentMonthStatementsOutflow = 0;
  const nextMonthStart = startOfMonth(addMonths(now, 1));
  for (const card of configuredCards) {
    const payable = [
      ...card.past.filter((statement) => statement.status === "OVERDUE"),
      ...(card.current ? [card.current] : []),
      ...card.upcoming,
    ];
    for (const statement of payable) {
      if (statement.status === "PAID") continue;
      const due = new Date(statement.dueDate);
      if (statement.status === "OVERDUE") {
        overdueStatementsOutflow += statement.amount;
        continue;
      }
      if (due < nextMonthStart) {
        // Vence ainda neste mês: entra como ajuste do saldo inicial, já que a
        // projeção mensal começa no mês seguinte.
        currentMonthStatementsOutflow += statement.amount;
        continue;
      }
      const key = monthKey(due);
      statementOutflowByMonth.set(
        key,
        (statementOutflowByMonth.get(key) ?? 0) + statement.amount,
      );
    }
  }

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

  // Ajustes do restante do mês corrente: a projeção mensal começa no mês
  // seguinte, mas faturas e transações agendadas que ainda vencem neste mês
  // precisam sair/entrar do saldo inicial (antes eram simplesmente ignoradas).
  const remainingCurrentMonthTransactions = pastTransactions.filter(
    (tx) =>
      !tx.installmentGroupId &&
      !tx.installmentTotal &&
      tx.occurredAt > now &&
      tx.occurredAt < nextMonthStart &&
      !(tx.domainAccountId && configuredCardIds.has(tx.domainAccountId)),
  );
  const remainingCurrentMonthNet = safeNumber(
    sumDecimals(
      remainingCurrentMonthTransactions.map((tx) =>
        tx.direction === DomainTransactionDirection.INFLOW
          ? tx.amount.abs()
          : tx.amount.abs().neg(),
      ),
    ),
  );
  const startingBalanceAdjustment =
    (settings.showFutureAccounts
      ? -(currentMonthStatementsOutflow + overdueStatementsOutflow)
      : 0) + remainingCurrentMonthNet;

  let currentBalance = overview.accountBalance.plus(
    new Prisma.Decimal(startingBalanceAdjustment.toFixed(2)),
  );
  const monthsData = [] as Array<{
    month: number;
    year: number;
    label: string;
    knownIncome: number;
    estimatedSalary: number;
    income: number;
    scenarioAdjustments: number;
    recurringExpenses: number;
    cardBills: number;
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
      // Parcelamentos em cartões com ciclo configurado já estão nas faturas.
      if (
        rule.isInstallment &&
        rule.accountId &&
        configuredCardIds.has(rule.accountId)
      )
        continue;
      // Respeita a periodicidade real: semanais podem ocorrer 4-5x no mês,
      // trimestrais/anuais só nos meses corretos (antes tudo era tratado
      // como mensal).
      const occurrences = occurrenceDatesInMonth(
        rule.interval,
        rule.nextDate,
        pointDate,
        pointMonthEnd,
      );
      if (occurrences.length === 0) continue;
      const multiplier = new Prisma.Decimal(occurrences.length);

      if (rule.type === "INCOME") {
        const incomeAmount = decimal(rule.amount).abs().times(multiplier);
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
            decimal(rule.amount).abs().times(multiplier),
          );
        }
      } else {
        recurringOutflow = recurringOutflow.plus(
          decimal(rule.amount).abs().times(multiplier),
        );
      }
    }

    // 2. Bills (apenas cartões sem ciclo configurado — os demais vêm do
    // motor de faturas em statementOutflowByMonth)
    const monthlyBills = settings.showFutureAccounts
      ? bills.filter(
          (bill) =>
            bill.dueDate &&
            bill.dueDate >= pointDate &&
            bill.dueDate <= pointMonthEnd &&
            !(
              bill.domainAccountId &&
              configuredCardIds.has(bill.domainAccountId)
            ),
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
          if (tx.domainAccountId && configuredCardIds.has(tx.domainAccountId)) {
            return false;
          }
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

    // 4. Future Transactions (Manual or scheduled). Compras futuras em
    // cartões configurados já estão embutidas nas próximas faturas.
    const futureTransactions = pastTransactions.filter(
      (tx) =>
        !tx.installmentGroupId &&
        !tx.installmentTotal &&
        tx.occurredAt >= pointDate &&
        tx.occurredAt <= pointMonthEnd &&
        !(tx.domainAccountId && configuredCardIds.has(tx.domainAccountId)),
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
    const cardBills = settings.showFutureAccounts
      ? (statementOutflowByMonth.get(monthKey(pointDate)) ?? 0)
      : 0;
    const installments = safeNumber(
      installmentsOutflow.plus(billsOutflow).plus(smartInstallmentsOutflow),
    );
    const variableExpenses = avgVariableExpenses;
    const knownFutureOutflow = safeNumber(futureOutflow);

    const totalOutflow =
      recurringExpenses +
      cardBills +
      installments +
      variableExpenses +
      knownFutureOutflow;
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
      cardBills,
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
      {
        salaryPatterns: settings.salaryPatterns,
        merchantName: tx.merchantName,
      },
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
            sum +
            month.recurringExpenses +
            month.cardBills +
            month.installments +
            month.variableExpenses,
          0,
        ) / monthsData.length
      : 0;

  const firstNegativeMonth =
    monthsData.find((month) => month.balance < 0) ?? null;

  return {
    summary: {
      averageMonthlyIncome,
      averageMonthlyExpenses,
      projectedSavings: safeNumber(
        currentBalance.minus(overview.accountBalance),
      ),
      currentBalance: safeNumber(overview.accountBalance),
      // Saídas/entradas já conhecidas até o fim do mês corrente (faturas a
      // vencer, transações agendadas) aplicadas antes do primeiro mês.
      currentMonthAdjustment:
        Math.round(startingBalanceAdjustment * 100) / 100,
      overdueStatements: Math.round(overdueStatementsOutflow * 100) / 100,
      firstNegativeMonth: firstNegativeMonth?.label ?? null,
      // Aportes mensais planejados em metas ativas (não descontados do saldo;
      // usados no insight de capacidade de poupança).
      goalCommitmentMonthly,
      goalCommitmentCount,
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
