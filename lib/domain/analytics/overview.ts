import { DomainAccountKind, Prisma, SourceProvider } from "@prisma/client";
import {
  isBrlCurrency,
  normalizeCurrencyCode,
  sumConvertedToBrl,
} from "@/lib/domain/currency";

import { getUserSettings } from "../queries";
import { prisma } from "@/lib/prisma";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import {
  buildMetricFilters,
  buildTransactionWhere,
  classifyCashFlowTransaction,
  decimal,
  isActiveInvestmentPosition,
  isOutstandingBill,
  percentOf,
  startOfLocalDay,
  sumDecimals,
  ZERO,
} from "./shared";

export async function getOverviewMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "mtd",
  });

  const [
    accounts,
    bills,
    investments,
    cryptoAssets,
    loans,
    settings,
    transactions,
    categories,
    usdBrlRate,
  ] = await Promise.all([
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
    prisma.domainTransaction.findMany({
      where: buildTransactionWhere(filters),
    }),
    prisma.domainCategory.findMany(),
    getUsdBrlRate(),
  ]);

  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );
  let inflow = ZERO;
  let outflow = ZERO;
  let operatingTransactionCount = 0;

  for (const transaction of transactions) {
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null;
    const classification = classifyCashFlowTransaction(
      transaction.direction,
      category?.name,
      category?.kind,
      transaction.description ?? transaction.normalizedDescription,
    );

    let amount = decimal(transaction.amount).abs();
    if (transaction.currencyCode && !isBrlCurrency(transaction.currencyCode)) {
      amount = amount.mul(new Prisma.Decimal(usdBrlRate));
    }

    if (classification === "income") {
      inflow = inflow.plus(amount);
      operatingTransactionCount += 1;
    } else if (classification === "expense") {
      outflow = outflow.plus(amount);
      operatingTransactionCount += 1;
    }
  }

  const trueAssetKinds = new Set<DomainAccountKind>([
    DomainAccountKind.BANK,
    DomainAccountKind.CASH,
    DomainAccountKind.OTHER,
  ]);
  const creditKinds = new Set<DomainAccountKind>([DomainAccountKind.CARD]);

  const liquidAccounts = accounts.filter((a) => trueAssetKinds.has(a.kind));
  const creditAccounts = accounts.filter((a) => creditKinds.has(a.kind));

  const accountBalance = sumConvertedToBrl(
    liquidAccounts,
    (account) => account.balance,
    (account) => account.currencyCode,
    usdBrlRate,
  );
  const creditCardDebt = sumConvertedToBrl(
    creditAccounts.map((account) => ({
      ...account,
      balance: decimal(account.balance).greaterThan(0)
        ? decimal(account.balance)
        : ZERO,
    })),
    (account) => account.balance,
    (account) => account.currencyCode,
    usdBrlRate,
  );
  const activeInvestments = investments.filter((investment) =>
    isActiveInvestmentPosition(investment.balance, investment.status),
  );
  const investmentsTotal = sumConvertedToBrl(
    activeInvestments,
    (item) => item.balance,
    (item) => item.currencyCode,
    usdBrlRate,
  );
  const cryptoTotal = sumDecimals(cryptoAssets.map((item) => item.value));

  const creditAccountIds = new Set(creditAccounts.map((a) => a.id));

  const now = new Date();
  const outstandingBills = bills.filter((bill) =>
    isOutstandingBill(bill.status, bill.dueDate, bill.totalAmount, now),
  );
  const liabilityBills = settings.showFutureAccounts
    ? outstandingBills
    : outstandingBills.filter(
        (bill) =>
          !bill.dueDate ||
          startOfLocalDay(bill.dueDate) <= startOfLocalDay(now),
      );
  const cardBills = liabilityBills.filter(
    (b) => b.domainAccountId && creditAccountIds.has(b.domainAccountId),
  );
  const otherBills = liabilityBills.filter(
    (b) => !b.domainAccountId || !creditAccountIds.has(b.domainAccountId),
  );

  const openCardBillsAmount = sumConvertedToBrl(
    cardBills,
    (b) => b.totalAmount,
    (b) => b.currencyCode,
    usdBrlRate,
  );
  const otherBillsAmount = sumConvertedToBrl(
    otherBills,
    (b) => b.totalAmount,
    (b) => b.currencyCode,
    usdBrlRate,
  );

  let creditCardLiabilities = creditCardDebt.greaterThan(openCardBillsAmount)
    ? creditCardDebt
    : openCardBillsAmount;

  if (!settings.showFutureAccounts && openCardBillsAmount.greaterThan(0)) {
    creditCardLiabilities = openCardBillsAmount;
  }

  const loanBalance = sumConvertedToBrl(
    loans,
    (loan) => loan.contractAmount,
    (loan) => loan.currencyCode,
    usdBrlRate,
  );

  const liabilitiesTotal = creditCardLiabilities
    .plus(otherBillsAmount)
    .plus(loanBalance);
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
      transactions: operatingTransactionCount,
      bills: liabilityBills.length,
      investments: activeInvestments.length,
      cryptoAssets: cryptoAssets.length,
    },
  };
}

export async function getAccountAllocationMetrics(
  searchParams: URLSearchParams,
) {
  const filters = buildMetricFilters(searchParams, { limit: 20 });
  const [accounts, usdBrlRate] = await Promise.all([
    prisma.domainAccount.findMany({
      where: {
        sourceProvider: filters.provider,
      },
      orderBy: [{ balance: "desc" }, { name: "asc" }],
    }),
    getUsdBrlRate(),
  ]);

  const creditKinds = new Set(["CARD", "CREDIT"]);

  const netWorth = sumConvertedToBrl(
    accounts.map((a) => ({
      ...a,
      balance: creditKinds.has(a.kind) ? decimal(a.balance).mul(-1) : a.balance,
    })),
    (a) => a.balance,
    (a) => a.currencyCode,
    usdBrlRate,
  );

  const positiveAccounts = accounts.filter(
    (account) => account.balance && account.balance.greaterThan(0),
  );
  const assetsTotal = sumConvertedToBrl(
    positiveAccounts,
    (a) => a.balance,
    (a) => a.currencyCode,
    usdBrlRate,
  );

  const byAccount = accounts.slice(0, filters.limit).map((account) => {
    const balBrl =
      normalizeCurrencyCode(account.currencyCode) === "USD"
        ? decimal(account.balance).mul(usdBrlRate)
        : decimal(account.balance);

    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      institutionName: account.institutionName,
      sourceProvider: account.sourceProvider,
      balance: decimal(account.balance),
      sharePercent: assetsTotal.isZero()
        ? ZERO
        : percentOf(balBrl.abs(), assetsTotal),
    };
  });

  const byKindMap = new Map<DomainAccountKind, Prisma.Decimal>();
  for (const account of accounts) {
    let bal = decimal(account.balance);
    if (normalizeCurrencyCode(account.currencyCode) === "USD") {
      bal = bal.mul(new Prisma.Decimal(usdBrlRate));
    }

    const current = byKindMap.get(account.kind) ?? ZERO;
    if (creditKinds.has(account.kind)) {
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
