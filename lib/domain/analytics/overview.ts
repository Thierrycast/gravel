import { DomainAccountKind, Prisma, SourceProvider } from "@prisma/client";
import { createBrlConverter, sumConvertedToBrl } from "@/lib/domain/currency";

import { summarizeAccountAllocation } from "./allocation";
import { getUserSettings } from "../queries";
import { prisma } from "@/lib/prisma";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import {
  buildMetricFilters,
  buildTransactionWhere,
  classifyCashFlowTransaction,
  decimal,
  detectInternalTransferPairIds,
  isActiveInvestmentPosition,
  isOutstandingBill,
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

  // Um conversor por chamada: converte o que conhece e anota o que não
  // conhece, em vez de somar euro como se fosse dólar.
  const toBrl = createBrlConverter(usdBrlRate);

  const categoryMap = new Map(
    categories.map((category) => [category.id, category]),
  );
  let inflow = ZERO;
  let outflow = ZERO;
  let operatingTransactionCount = 0;

  // Pares de auto-transferência (mesmo valor, mesmo contraparte) não entram em
  // receita nem despesa reais.
  const internalTransferPairIds = detectInternalTransferPairIds(transactions);

  for (const transaction of transactions) {
    if (internalTransferPairIds.has(transaction.id)) continue;
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null;
    const classification = classifyCashFlowTransaction(
      transaction.direction,
      category?.name,
      category?.kind,
      transaction.description ?? transaction.normalizedDescription,
      {
        salaryPatterns: settings.salaryPatterns,
        merchantName: transaction.merchantName,
      },
    );

    const amount = toBrl(decimal(transaction.amount).abs(), transaction.currencyCode);

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
  // DomainCryptoAsset.value é cotado em USDT (~USD). Converter aqui garante
  // que TODO consumidor (rota web, MCP, CLI, insights) receba BRL — antes cada
  // wrapper convertia por conta própria e o MCP/CLI reportavam valores mistos.
  const cryptoTotal = sumDecimals(cryptoAssets.map((item) => item.value)).mul(
    new Prisma.Decimal(usdBrlRate),
  );

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
    usdBrlRate: new Prisma.Decimal(usdBrlRate),
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

  // A matemática vive em ./allocation.ts, testável sem banco. Aqui ficou só a
  // consulta — era a mistura das duas coisas que deixava o cálculo sem teste.
  const allocation = summarizeAccountAllocation(accounts, usdBrlRate, filters.limit);

  return {
    total: allocation.netWorth,
    byAccount: allocation.byAccount,
    byKind: allocation.byKind,
    counts: {
      totalAccounts: accounts.length,
      positiveAccounts: allocation.assetAccountCount,
    },
    // Quando aparece moeda que não sabemos converter, o payload diz — antes
    // ela era somada 1:1 com BRL e ninguém ficava sabendo.
    unsupportedCurrencies: allocation.unsupportedCurrencies,
  };
}
