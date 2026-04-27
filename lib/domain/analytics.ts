import {
  DomainAccountKind,
  DomainTransactionDirection,
  Prisma,
  SourceProvider,
} from "@prisma/client";

import {
  normalizePagination,
  parseBooleanParam,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters";
import { computeCryptoPositionStates } from "@/lib/domain/crypto-math";
import { isBrlCurrency, sumCurrencyDecimals } from "@/lib/domain/currency";
import { getUserSettings } from "./queries";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";
import { getCryptoLogo } from "@/lib/domain/utils";

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 24 * 60 * 60 * 1000;

type DecimalLike = Prisma.Decimal | null | undefined;

type MetricFilters = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  from?: Date;
  to?: Date;
  period?: string;
  accountId?: string;
  categoryId?: string;
  merchantId?: string;
  provider?: SourceProvider;
  asset?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  groupBy: "day" | "week" | "month";
  includeIgnored: boolean;
  limit: number;
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

function safeDivide(value: Prisma.Decimal, denominator: Prisma.Decimal) {
  if (denominator.equals(0)) return null;
  return value.div(denominator);
}

function percentOf(value: Prisma.Decimal, total: Prisma.Decimal) {
  if (total.equals(0)) return ZERO;
  return value.div(total).mul(100);
}

function clampDateToPeriodStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function resolvePeriodStart(period: string | null, to: Date) {
  switch (period) {
    case "7d":
      return new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "180d":
      return new Date(to.getTime() - 180 * 24 * 60 * 60 * 1000);
    case "365d":
    case "12m":
      return new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "mtd":
    case "month":
      return clampDateToPeriodStart(to);
    case "ytd":
      return new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
    case "all":
    default:
      return undefined;
  }
}

function getWeekStart(date: Date) {
  const current = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = current.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + diff);
  return current;
}

function formatBucket(date: Date, groupBy: MetricFilters["groupBy"]) {
  if (groupBy === "day") return date.toISOString().slice(0, 10);
  if (groupBy === "week") return getWeekStart(date).toISOString().slice(0, 10);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMetricFilters(
  searchParams: URLSearchParams,
  defaults?: {
    period?: string;
    groupBy?: MetricFilters["groupBy"];
    limit?: number;
  },
) {
  const to = parseDateParam(searchParams.get("to")) ?? new Date();
  const period = searchParams.get("period") ?? defaults?.period;
  const from =
    parseDateParam(searchParams.get("from")) ??
    resolvePeriodStart(period ?? null, to);
  const page = parseNumberParam(searchParams.get("page"), 1) ?? 1;
  const pageSize = parseNumberParam(searchParams.get("pageSize"), 50) ?? 50;
  const pagination = normalizePagination(page, pageSize);
  const providerParam = searchParams.get("provider");

  return {
    ...pagination,
    from,
    to,
    period: period ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    merchantId: searchParams.get("merchantId") ?? undefined,
    provider: providerParam
      ? (providerParam.toUpperCase() as SourceProvider)
      : undefined,
    asset: searchParams.get("asset")?.toUpperCase() ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
    groupBy:
      searchParams.get("groupBy") === "day"
        ? "day"
        : searchParams.get("groupBy") === "week"
          ? "week"
          : (defaults?.groupBy ?? "month"),
    includeIgnored: parseBooleanParam(searchParams.get("ignored")),
    limit:
      parseNumberParam(searchParams.get("limit"), defaults?.limit ?? 10) ?? 10,
  } satisfies MetricFilters;
}

function buildTransactionWhere(
  filters: MetricFilters,
): Prisma.DomainTransactionWhereInput {
  return {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
    domainMerchantId: filters.merchantId,
    sourceProvider: filters.provider,
    OR: [
      { currencyCode: null },
      { currencyCode: "BRL" },
      { currencyCode: "R$" },
    ],
    ...(filters.includeIgnored ? {} : { ignored: false }),
  };
}

export function parseMetricQuery(
  searchParams: URLSearchParams,
  defaults?: {
    period?: string;
    groupBy?: MetricFilters["groupBy"];
    limit?: number;
  },
) {
  return buildMetricFilters(searchParams, defaults);
}

export const EXCLUDED_SPENDING_CATEGORIES = [
  "pagamento de cartão de crédito",
  "transferência mesma titularidade",
  "transferência entre contas",
  "pagamento de fatura",
  "fatura de cartão",
  "pagamento de fatura de cartão",
  "investimento",
  "aplicação",
  "resgate",
  "aporte",
  "depósito para corretora",
  "transferência - mesma titularidade",
];

const INVESTMENT_TRANSFER_TERMS = [
  "investimento",
  "aplicação",
  "aplicacao",
  "aporte",
  "corretora",
  "binance",
  "cripto",
  "crypto",
  "tesouro direto",
  "renda fixa",
  "cdb",
  "xp investimento",
  "clear corretora",
  "rico corretora",
];

export function isInternalTransfer(
  categoryName?: string | null,
  categoryKind?: string | null,
) {
  if (categoryKind === "TRANSFER") return true;
  if (!categoryName) return false;
  const lower = categoryName.toLowerCase();
  return EXCLUDED_SPENDING_CATEGORIES.some((excluded) =>
    lower.includes(excluded.toLowerCase()),
  );
}

export function isInvestmentTransfer(
  categoryName?: string | null,
  _categoryKind?: string | null,
  description?: string | null,
) {
  const value = [categoryName, description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!value) return false;
  return INVESTMENT_TRANSFER_TERMS.some((term) => value.includes(term));
}

function isRealSpending(
  categoryName: string | undefined,
  categoryKind: string | undefined,
): boolean {
  return !isInternalTransfer(categoryName, categoryKind);
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function normalizeBillStatus(
  status: string | null | undefined,
  dueDate: Date | null | undefined,
  totalAmount?: DecimalLike,
  now = new Date(),
) {
  const normalized = status?.trim().toUpperCase();
  const total = decimal(totalAmount);

  if (normalized === "PAID" || normalized === "SETTLED") return "PAID";
  if (total.lessThanOrEqualTo(0)) return "CLOSED";
  if (!dueDate) return normalized === "CLOSED" ? "CLOSED" : "OPEN";

  const dueDay = startOfLocalDay(dueDate);
  const today = startOfLocalDay(now);

  if (dueDay < today) {
    if (normalized === "CLOSED") return "CLOSED";
    return "OVERDUE";
  }

  if (normalized === "CLOSED") return "CLOSED";
  return "OPEN";
}

export async function getOverviewMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "mtd",
  });

  const [accounts, bills, investments, cryptoAssets, loans, settings] =
    await Promise.all([
      prisma.domainAccount.findMany({
        where: {
          sourceProvider: filters.provider,
        },
      }),
      prisma.domainBill.findMany({
        where: {
          sourceProvider: filters.provider,
        },
      }),
      prisma.domainInvestment.findMany({
        where: {
          sourceProvider: filters.provider,
        },
      }),
      prisma.domainCryptoAsset.findMany({
        where: {
          asset: filters.asset,
          sourceProvider: filters.provider,
        },
      }),
      prisma.pluggyLoanRecord.findMany({
        where: {
          ...(filters.provider && filters.provider !== SourceProvider.PLUGGY
            ? { id: "__none__" }
            : {}),
          status: {
            notIn: ["PAID", "SETTLED", "CLOSED", "CANCELLED"],
          },
        },
      }),
      getUserSettings(searchParams),
    ]);

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
  const excludedIds = excludedCategories.map((c) => c.id);

  const [inflowAgg, outflowAgg] = await Promise.all([
    prisma.domainTransaction.aggregate({
      where: {
        ...buildTransactionWhere(filters),
        direction: DomainTransactionDirection.INFLOW,
        domainCategoryId: { notIn: excludedIds },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.domainTransaction.aggregate({
      where: {
        ...buildTransactionWhere(filters),
        direction: DomainTransactionDirection.OUTFLOW,
        domainCategoryId: { notIn: excludedIds },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // Split accounts by semantic role:
  // - BANK / CASH / OTHER: true liquid assets (positive = money you have)
  // - CARD / CREDIT: Pluggy stores the outstanding bill as a POSITIVE value
  //   (the amount you OWE). These are liabilities, NOT assets.
  const trueAssetKinds = new Set<DomainAccountKind>([
    DomainAccountKind.BANK,
    DomainAccountKind.CASH,
    DomainAccountKind.OTHER,
  ]);
  const creditKinds = new Set<DomainAccountKind>([DomainAccountKind.CARD]);

  const liquidAccounts = accounts.filter(
    (a) => trueAssetKinds.has(a.kind) && isBrlCurrency(a.currencyCode),
  );
  const creditAccounts = accounts.filter(
    (a) => creditKinds.has(a.kind) && isBrlCurrency(a.currencyCode),
  );

  const accountBalance = sumCurrencyDecimals(
    liquidAccounts,
    (account) => account.balance,
    (account) => account.currencyCode,
  );
  // Credit card outstanding balance (positive in Pluggy = debt owed by the user)
  const creditCardDebt = sumDecimals(
    creditAccounts.map((account) => {
      const bal = decimal(account.balance);
      // Positive balance = debt owed; negative balance = credit in favour (rare, treat as 0)
      return bal.greaterThan(0) ? bal : ZERO;
    }),
  );
  const investmentsTotal = sumCurrencyDecimals(
    investments,
    (item) => item.balance,
    (item) => item.currencyCode,
  );
  const cryptoTotal = sumDecimals(cryptoAssets.map((item) => item.value));

  // Liabilities logic:
  // We need to be careful not to double count credit card debt.
  // We separate bills into those linked to a credit card account and those that aren't.
  const creditAccountIds = new Set(creditAccounts.map((a) => a.id));

  const brlBills = bills.filter((bill) => isBrlCurrency(bill.currencyCode));
  const cardBills = brlBills.filter(
    (b) => b.domainAccountId && creditAccountIds.has(b.domainAccountId),
  );
  const otherBills = brlBills.filter(
    (b) => !b.domainAccountId || !creditAccountIds.has(b.domainAccountId),
  );

  const openCardBillsAmount = sumDecimals(cardBills.map((b) => b.totalAmount));
  const otherBillsAmount = sumDecimals(otherBills.map((b) => b.totalAmount));

  // For cards, we take the maximum of the statement (bill) or the current balance (debt).
  // This handles the transition between billing cycles correctly.
  // CRITICAL: If settings.showFutureAccounts is false, we prioritize the bills (already invoiced)
  // to avoid showing a negative net worth due to future installments.
  let creditCardLiabilities = creditCardDebt.greaterThan(openCardBillsAmount)
    ? creditCardDebt
    : openCardBillsAmount;

  if (!settings.showFutureAccounts && openCardBillsAmount.greaterThan(0)) {
    // If we want to hide future installments, we only show the current bills amount
    // provided there is one (otherwise we show the debt as it might be current spending)
    creditCardLiabilities = openCardBillsAmount;
  }

  const loanBalance = sumCurrencyDecimals(
    loans,
    (loan) => loan.contractAmount,
    (loan) => loan.currencyCode,
  );
  const liabilitiesTotal = creditCardLiabilities
    .plus(otherBillsAmount)
    .plus(loanBalance);
  const inflow = decimal(inflowAgg._sum?.amount);
  const outflow = decimal(outflowAgg._sum?.amount).abs();

  // ── Fiat / crypto breakdown ─────────────────────────────────────────────
  // Fiat-only side: liquid bank/cash + traditional investments minus debts.
  // Crypto side is intentionally kept separate so the UI can present them
  // independently and avoid mixing volatility into the bank balance picture.
  const fiatAssets = accountBalance.plus(investmentsTotal);
  const fiatNetWorth = fiatAssets.minus(liabilitiesTotal);
  const cryptoNetWorth = cryptoTotal;

  return {
    accountBalance,
    investmentsTotal,
    cryptoTotal,
    openBills: openCardBillsAmount.plus(otherBillsAmount),
    loanBalance,
    liabilitiesTotal,
    fiatAssets,
    fiatNetWorth,
    cryptoNetWorth,
    grossAssets: fiatAssets.plus(cryptoTotal),
    netWorth: fiatNetWorth.plus(cryptoNetWorth),
    monthlyInflow: inflow,
    monthlyOutflow: outflow,
    monthlyNet: inflow.minus(outflow),
    periodInflow: inflow,
    periodOutflow: outflow,
    periodNet: inflow.minus(outflow),
    appliedFilters: {
      from: filters.from,
      to: filters.to,
      provider: filters.provider,
      asset: filters.asset,
    },
    counts: {
      accounts: accounts.length,
      transactions:
        (Number(inflowAgg._count) || 0) + (Number(outflowAgg._count) || 0),

      bills: bills.length,
      investments: investments.length,
      cryptoAssets: cryptoAssets.length,
    },
  };
}

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

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const buckets = new Map<
    string,
    {
      inflow: Prisma.Decimal;
      outflow: Prisma.Decimal;
      investments: Prisma.Decimal;
      net: Prisma.Decimal;
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
    const investmentTransfer = isInvestmentTransfer(
      cat?.name,
      cat?.kind,
      transaction.description ?? transaction.normalizedDescription,
    );

    if (investmentTransfer) {
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

    if (!isRealSpending(cat?.name, cat?.kind)) continue;

    if (transaction.direction === DomainTransactionDirection.INFLOW) {
      current.inflow = current.inflow.plus(transaction.amount);
    } else if (transaction.direction === DomainTransactionDirection.OUTFLOW) {
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

export async function getNetWorthMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "12m",
  });
  const [overview, snapshots, usdBrl, settings, activeScenarios, pendingLends] =
    await Promise.all([
      getOverviewMetrics(searchParams),
      prisma.portfolioSnapshot.findMany({
        where: {
          date: {
            gte: filters.from,
            lte: filters.to,
          },
        },
        orderBy: { date: "asc" },
        take: 120,
      }),
      getUsdBrlRate(),
      getUserSettings(searchParams),
      prisma.domainScenarioEvent.findMany({
        where: { isActive: true },
        orderBy: { date: "asc" },
      }),
      prisma.domainLend.findMany({
        where: { status: "PENDING" },
      }),
    ]);

  const rate = new Prisma.Decimal(usdBrl);
  const cryptoAssets = overview.cryptoTotal.mul(rate);

  // Pending lends are money we HAVE but is currently with others.
  // For net worth purposes, it's an asset.
  const totalPendingLends = sumDecimals(pendingLends.map((l) => l.amount));

  const grossAssets = overview.fiatAssets
    .plus(cryptoAssets)
    .plus(totalPendingLends);
  const currentNetWorth = overview.fiatNetWorth
    .plus(cryptoAssets)
    .plus(totalPendingLends);

  const points: Array<{
    date: Date;
    netWorth: Prisma.Decimal;
    scenarioNetWorth?: number;
    source: "snapshot" | "current";
    assets?: Prisma.Decimal;
    fiatAssets?: Prisma.Decimal;
    cryptoAssets?: Prisma.Decimal;
    liabilities?: Prisma.Decimal;
  }> = snapshots.map((snapshot) => ({
    date: snapshot.date,
    netWorth: snapshot.netWorth,
    source: "snapshot",
  }));

  points.push({
    date: new Date(),
    netWorth: currentNetWorth,
    assets: grossAssets,
    fiatAssets: overview.fiatAssets,
    cryptoAssets,
    liabilities: overview.liabilitiesTotal,
    source: "current",
  });

  // Add future projection points
  if (
    (settings.showFutureSalary && settings.monthlySalary > 0) ||
    activeScenarios.length > 0
  ) {
    let projectedNW = currentNetWorth;
    let scenarioNW = currentNetWorth;
    const now = new Date();

    // Projection for next 12 months (or more if requested in settings)
    const lookaheadMonths = 12;

    for (let i = 1; i <= lookaheadMonths; i++) {
      const projDate = new Date(now);
      projDate.setMonth(projDate.getMonth() + i);
      projDate.setDate(1); // Start of month

      const monthStart = new Date(
        projDate.getFullYear(),
        projDate.getMonth(),
        1,
      );
      const monthEnd = new Date(
        projDate.getFullYear(),
        projDate.getMonth() + 1,
        0,
      );

      // Apply Base Salary (Reality)
      if (settings.showFutureSalary) {
        projectedNW = projectedNW.plus(
          new Prisma.Decimal(settings.monthlySalary),
        );
      }

      // Scenario NW starts equal to projected unless modified by scenarios
      scenarioNW = projectedNW;

      // Apply Scenarios (Hypothetical)
      const monthScenarios = activeScenarios.filter((s) => {
        const d = new Date(s.date);
        return d >= monthStart && d <= monthEnd;
      });

      for (const scenario of monthScenarios) {
        scenarioNW = scenarioNW.plus(decimal(scenario.amount));
      }

      points.push({
        date: projDate,
        netWorth: projectedNW,
        scenarioNetWorth: scenarioNW.toNumber(),
        source: "snapshot",
      });
    }
  }

  return {
    current: currentNetWorth,
    points,
    valuation: {
      fiatAssets: overview.fiatAssets.plus(totalPendingLends),
      accountBalance: overview.accountBalance,
      investmentsTotal: overview.investmentsTotal,
      cryptoAssets,
      grossAssets,
      liabilities: overview.liabilitiesTotal,
      fiatNetWorth: overview.fiatNetWorth.plus(totalPendingLends),
      cryptoNetWorth: cryptoAssets,
      netWorth: currentNetWorth,
      usdBrlRate: rate,
    },
    appliedFilters: {
      from: filters.from,
      to: filters.to,
    },
  };
}

export async function getAccountAllocationMetrics(
  searchParams: URLSearchParams,
) {
  const filters = buildMetricFilters(searchParams, { limit: 20 });
  const accounts = await prisma.domainAccount.findMany({
    where: {
      sourceProvider: filters.provider,
    },
    orderBy: [{ balance: "desc" }, { name: "asc" }],
  });

  // Net worth = bank/investment assets MINUS credit card liabilities
  // Credit cards store their balance as the outstanding debt (positive = you owe that amount)
  // so we subtract them from the total.
  const creditKinds = new Set(["CARD", "CREDIT"]);

  const netWorth = accounts.reduce((sum, account) => {
    const bal = decimal(account.balance);
    if (creditKinds.has(account.kind)) {
      // Credit card balance is a liability — subtract it
      return sum.minus(bal.abs());
    }
    return sum.plus(bal);
  }, ZERO);

  // For the per-account breakdown we show absolute values with the frontend
  // deciding sign based on kind, so we use the raw balance.
  const positiveAccounts = accounts.filter(
    (account) => account.balance && account.balance.greaterThan(0),
  );
  const assetsTotal = sumDecimals(
    positiveAccounts.map((account) => account.balance),
  );

  const byAccount = accounts.slice(0, filters.limit).map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    institutionName: account.institutionName,
    sourceProvider: account.sourceProvider,
    balance: decimal(account.balance),
    // sharePercent is relative to total positive assets for display purposes
    sharePercent: assetsTotal.isZero()
      ? ZERO
      : percentOf(decimal(account.balance).abs(), assetsTotal),
  }));

  const byKindMap = new Map<DomainAccountKind, Prisma.Decimal>();
  for (const account of accounts) {
    const bal = decimal(account.balance);
    const current = byKindMap.get(account.kind) ?? ZERO;
    if (creditKinds.has(account.kind)) {
      // Store as negative so the frontend shows correctly signed values
      byKindMap.set(account.kind, current.minus(bal.abs()));
    } else {
      byKindMap.set(account.kind, current.plus(bal));
    }
  }

  const byKind = Array.from(byKindMap.entries())
    .map(([kind, balance]) => ({
      kind,
      balance,
      sharePercent: assetsTotal.isZero()
        ? ZERO
        : percentOf(balance.abs(), assetsTotal),
    }))
    .sort((left, right) => right.balance.comparedTo(left.balance));

  return {
    total: netWorth,
    byAccount,
    byKind,
    counts: {
      totalAccounts: accounts.length,
      positiveAccounts: positiveAccounts.length,
    },
  };
}

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
  const excludedIds = excludedCategories.map((c) => c.id);

  const grouped = await prisma.domainTransaction.groupBy({
    by: ["domainCategoryId"],
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
      domainCategoryId: { notIn: excludedIds },
    },
    _sum: { amount: true },
    _count: true,
  });

  const categoryIds = grouped
    .map((g) => g.domainCategoryId)
    .filter((id): id is string => Boolean(id));

  const categoryDetails = await prisma.domainCategory.findMany({
    where: { id: { in: categoryIds } },
  });
  const categoryMap = new Map(categoryDetails.map((c) => [c.id, c]));

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
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
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
      amount: Prisma.Decimal;
      count: number;
      averageAmount: Prisma.Decimal;
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
        merchant?.displayName ?? transaction.merchantName ?? "Nao identificado",
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

export async function getCryptoAssetMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "all",
    limit: 50,
  });
  const priceHistoryCutoff = new Date(
    (filters.to ?? new Date()).getTime() - DAY_MS,
  );

  // 1. Resolve all unique assets from both current balances and historical trades
  const [assetRecords, tradeAssets] = await Promise.all([
    prisma.binanceAssetRecord.findMany({
      where: filters.asset ? { asset: filters.asset } : {},
      select: { asset: true },
    }),
    prisma.binanceTradeRecord.groupBy({
      by: ["baseAsset"],
      where: filters.asset ? { baseAsset: filters.asset } : {},
    }),
  ]);

  const allAssetNames = Array.from(
    new Set([
      ...assetRecords.map((r) => r.asset),
      ...tradeAssets.map((t) => t.baseAsset).filter((a): a is string => !!a),
    ]),
  ).sort();

  const total = allAssetNames.length;

  const [trades, balanceSnapshots, priceSnapshots] = await Promise.all([
    prisma.binanceTradeRecord.findMany({
      where: {
        baseAsset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        tradedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
    }),
    prisma.binanceAssetBalanceSnapshot.findMany({
      where: {
        asset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
    prisma.binanceAssetPriceSnapshot.findMany({
      where: {
        asset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
  ]);

  const priceMap = new Map<string, (typeof priceSnapshots)[number]>();
  const previousDayPriceMap = new Map<
    string,
    (typeof priceSnapshots)[number]
  >();
  for (const price of priceSnapshots) {
    if (!priceMap.has(price.asset)) {
      priceMap.set(price.asset, price);
    }
    if (
      price.fetchedAt <= priceHistoryCutoff &&
      !previousDayPriceMap.has(price.asset)
    ) {
      previousDayPriceMap.set(price.asset, price);
    }
  }
  const balanceMap = new Map<string, (typeof balanceSnapshots)[number]>();
  for (const balance of balanceSnapshots) {
    if (!balanceMap.has(balance.asset)) {
      balanceMap.set(balance.asset, balance);
    }
  }

  const states = computeCryptoPositionStates(trades, {
    asset: filters.asset,
    from: filters.from,
    to: filters.to,
  });

  const allResults = allAssetNames
    .map((asset) => {
      const state = states.get(asset);
      const price = priceMap.get(asset);
      const previousDayPrice = previousDayPriceMap.get(asset);
      const balance = balanceMap.get(asset);
      const quantity = balance?.total ?? state?.quantity ?? ZERO;
      const currentPrice = price?.price ?? null;
      const currentValue = currentPrice ? currentPrice.mul(quantity) : null;
      const coveredQuantity = state
        ? Prisma.Decimal.min(state.quantity, quantity)
        : ZERO;
      const missingCostBasisQuantity = Prisma.Decimal.max(
        ZERO,
        quantity.minus(coveredQuantity),
      );
      const costBasisMissing =
        quantity.greaterThan(0) && missingCostBasisQuantity.greaterThan(0);
      const coveredCurrentValue =
        currentPrice && coveredQuantity.greaterThan(0)
          ? currentPrice.mul(coveredQuantity)
          : null;
      const totalCostBasis =
        state?.averageCost && coveredQuantity.greaterThan(0)
          ? state.averageCost.mul(coveredQuantity)
          : null;
      const unrealizedPnl =
        coveredCurrentValue && totalCostBasis
          ? coveredCurrentValue.minus(totalCostBasis)
          : null;
      const unrealizedPnlPercent =
        unrealizedPnl && totalCostBasis && !totalCostBasis.equals(0)
          ? unrealizedPnl.div(totalCostBasis).mul(100)
          : null;
      const change24hPercent =
        currentPrice &&
        previousDayPrice?.price &&
        !previousDayPrice.price.equals(0)
          ? currentPrice
              .minus(previousDayPrice.price)
              .div(previousDayPrice.price)
              .mul(100)
          : null;

      return {
        asset,
        imageUrl: getCryptoLogo(asset),
        quoteAsset: price?.quoteAsset ?? state?.quoteAsset ?? null,
        quantity,
        coveredQuantity,
        missingCostBasisQuantity,
        costBasisMissing,
        currentPrice,
        currentValue,
        coveredCurrentValue,
        averageCost: state?.averageCost ?? null,
        totalCostBasis,
        unrealizedPnl,
        unrealizedPnlPercent,
        change24hPercent,
        realizedPnl: state?.realizedPnl ?? ZERO,
        periodRealizedPnl: state?.periodRealizedPnl ?? ZERO,
        periodTradeCount: state?.periodTradeCount ?? 0,
        periodBuyCount: state?.periodBuyCount ?? 0,
        periodSellCount: state?.periodSellCount ?? 0,
        periodBuyQuantity: state?.periodBuyQuantity ?? ZERO,
        periodSellQuantity: state?.periodSellQuantity ?? ZERO,
        averageBuyPrice:
          state && state.periodBuyQuantity.greaterThan(0)
            ? state.periodBuyNotional.div(state.periodBuyQuantity)
            : null,
        averageSellPrice:
          state && state.periodSellQuantity.greaterThan(0)
            ? state.periodSellNotional.div(state.periodSellQuantity)
            : null,
        firstTradeAt: state?.firstTradeAt ?? null,
        lastTradeAt: state?.lastTradeAt ?? null,
        tradeCount: state?.tradeCount ?? 0,
      };
    })
    .sort((left, right) => {
      const valueComparison = decimal(right.currentValue).comparedTo(
        decimal(left.currentValue),
      );
      if (valueComparison !== 0) return valueComparison;
      return left.asset.localeCompare(right.asset);
    });

  const results = allResults.slice(filters.skip, filters.skip + filters.take);
  const totalValue = sumDecimals(allResults.map((item) => item.currentValue));
  const totalCostBasis = sumDecimals(
    allResults.map((item) => item.totalCostBasis),
  );
  const totalUnrealizedPnl = sumDecimals(
    allResults.map((item) => item.unrealizedPnl),
  );
  const costBasisMissingAssets = allResults.filter(
    (item) => item.costBasisMissing,
  ).length;

  return {
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    allResults,
    results,
    summary: {
      totalValue,
      totalCostBasis,
      totalUnrealizedPnl,
      totalUnrealizedPnlPercent: safeDivide(
        totalUnrealizedPnl.mul(100),
        totalCostBasis,
      ),
      costBasisMissing: costBasisMissingAssets > 0,
      costBasisMissingAssets,
      appliedFilters: {
        from: filters.from,
        to: filters.to,
        asset: filters.asset,
      },
    },
  };
}

export async function getCryptoPortfolioMetrics(searchParams: URLSearchParams) {
  const payload = await getCryptoAssetMetrics(searchParams);
  const assets = payload.allResults.filter(
    (asset) => asset.currentValue !== null,
  );
  const totalValue = sumDecimals(assets.map((asset) => asset.currentValue));
  const totalCostBasis = sumDecimals(
    assets.map((asset) => asset.totalCostBasis),
  );
  const totalUnrealizedPnl = sumDecimals(
    assets.map((asset) => asset.unrealizedPnl),
  );
  const totalRealizedPnl = sumDecimals(
    assets.map((asset) => asset.realizedPnl),
  );
  const costBasisMissingAssets = assets.filter(
    (asset) => asset.costBasisMissing,
  ).length;
  const allocations = assets
    .map((asset) => ({
      asset: asset.asset,
      value: asset.currentValue,
      sharePercent: percentOf(decimal(asset.currentValue), totalValue),
    }))
    .sort((left, right) =>
      decimal(right.value).comparedTo(decimal(left.value)),
    );

  const orderedByPnl = [...assets].sort((left, right) =>
    decimal(right.unrealizedPnl).comparedTo(decimal(left.unrealizedPnl)),
  );

  return {
    totalValue,
    totalCostBasis,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalUnrealizedPnlPercent: safeDivide(
      totalUnrealizedPnl.mul(100),
      totalCostBasis,
    ),
    assets: assets.length,
    costBasisMissing: costBasisMissingAssets > 0,
    costBasisMissingAssets,
    allocations,
    bestPerformer: orderedByPnl[0] ?? null,
    worstPerformer: orderedByPnl.at(-1) ?? null,
    appliedFilters: payload.summary.appliedFilters,
  };
}
