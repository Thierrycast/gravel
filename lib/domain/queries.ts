import {
  DomainAccountKind,
  DomainTransactionDirection,
  Prisma,
} from "@prisma/client"

import {
  normalizePagination,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters"
import { prisma } from "@/lib/prisma"

function sumDecimals(values: Array<Prisma.Decimal | null | undefined>) {
  return values.reduce(
    (total: Prisma.Decimal, current) => total.plus(current ?? 0),
    new Prisma.Decimal(0)
  )
}

export function parseDomainQuery(searchParams: URLSearchParams) {
  return {
    page: parseNumberParam(searchParams.get("page"), 1) ?? 1,
    pageSize: parseNumberParam(searchParams.get("pageSize"), 50) ?? 50,
    from: parseDateParam(searchParams.get("from")),
    to: parseDateParam(searchParams.get("to")),
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    merchantId: searchParams.get("merchantId") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    asset: searchParams.get("asset") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
  } as const
}

export async function getDomainAccounts(searchParams: URLSearchParams) {
  const filters = parseDomainQuery(searchParams)
  const pagination = normalizePagination(filters.page, filters.pageSize)
  const where: Prisma.DomainAccountWhereInput = {
    sourceProvider: filters.provider ? (filters.provider as never) : undefined,
  }

  const [total, results] = await Promise.all([
    prisma.domainAccount.count({ where }),
    prisma.domainAccount.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainTransactions(searchParams: URLSearchParams) {
  const filters = parseDomainQuery(searchParams)
  const pagination = normalizePagination(filters.page, filters.pageSize)
  const where: Prisma.DomainTransactionWhereInput = {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
    domainMerchantId: filters.merchantId,
    sourceProvider: filters.provider ? (filters.provider as never) : undefined,
    ...(searchParams.get("ignored") === "true"
      ? {}
      : { ignored: false }),
  }

  const [total, results] = await Promise.all([
    prisma.domainTransaction.count({ where }),
    prisma.domainTransaction.findMany({
      where,
      orderBy: [{ occurredAt: filters.sortOrder }, { createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainCategories(searchParams: URLSearchParams) {
  const pagination = normalizePagination(
    parseNumberParam(searchParams.get("page"), 1),
    parseNumberParam(searchParams.get("pageSize"), 100)
  )

  const [total, results] = await Promise.all([
    prisma.domainCategory.count(),
    prisma.domainCategory.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainMerchants(searchParams: URLSearchParams) {
  const pagination = normalizePagination(
    parseNumberParam(searchParams.get("page"), 1),
    parseNumberParam(searchParams.get("pageSize"), 100)
  )

  const [total, results] = await Promise.all([
    prisma.domainMerchant.count(),
    prisma.domainMerchant.findMany({
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainBills(searchParams: URLSearchParams) {
  const filters = parseDomainQuery(searchParams)
  const pagination = normalizePagination(filters.page, filters.pageSize)
  const where: Prisma.DomainBillWhereInput = {
    domainAccountId: filters.accountId,
    sourceProvider: filters.provider ? (filters.provider as never) : undefined,
    dueDate: {
      gte: filters.from,
      lte: filters.to,
    },
  }

  const [total, results] = await Promise.all([
    prisma.domainBill.count({ where }),
    prisma.domainBill.findMany({
      where,
      orderBy: [{ dueDate: filters.sortOrder }, { updatedAt: "desc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainInvestments(searchParams: URLSearchParams) {
  const filters = parseDomainQuery(searchParams)
  const pagination = normalizePagination(filters.page, filters.pageSize)
  const where: Prisma.DomainInvestmentWhereInput = {
    sourceProvider: filters.provider ? (filters.provider as never) : undefined,
  }

  const [total, results] = await Promise.all([
    prisma.domainInvestment.count({ where }),
    prisma.domainInvestment.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getDomainCryptoAssets(searchParams: URLSearchParams) {
  const pagination = normalizePagination(
    parseNumberParam(searchParams.get("page"), 1),
    parseNumberParam(searchParams.get("pageSize"), 100)
  )
  const asset = searchParams.get("asset") ?? undefined

  const where: Prisma.DomainCryptoAssetWhereInput = {
    asset,
  }

  const [total, results] = await Promise.all([
    prisma.domainCryptoAsset.count({ where }),
    prisma.domainCryptoAsset.findMany({
      where,
      orderBy: [{ value: "desc" }, { asset: "asc" }],
      skip: pagination.skip,
      take: pagination.take,
    }),
  ])

  return {
    total,
    ...pagination,
    results,
  }
}

export async function getOverviewMetrics() {
  const [accounts, bills, investments, cryptoAssets, transactions] =
    await Promise.all([
      prisma.domainAccount.findMany(),
      prisma.domainBill.findMany(),
      prisma.domainInvestment.findMany(),
      prisma.domainCryptoAsset.findMany(),
      prisma.domainTransaction.findMany({
        where: {
          occurredAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
          ignored: false,
        },
      }),
    ])

  const liquidAccountKinds = new Set<DomainAccountKind>([
    DomainAccountKind.BANK,
    DomainAccountKind.CASH,
  ])
  const liquidAccounts = accounts.filter((account) =>
    liquidAccountKinds.has(account.kind)
  )

  const accountBalance = sumDecimals(liquidAccounts.map((account) => account.balance))
  const investmentsTotal = sumDecimals(investments.map((item) => item.balance))
  const cryptoTotal = sumDecimals(cryptoAssets.map((item) => item.value))
  const openBills = sumDecimals(bills.map((bill) => bill.totalAmount))
  const inflow = sumDecimals(
    transactions
      .filter((transaction) => transaction.direction === DomainTransactionDirection.INFLOW)
      .map((transaction) => transaction.amount)
  )
  const outflow = sumDecimals(
    transactions
      .filter((transaction) => transaction.direction === DomainTransactionDirection.OUTFLOW)
      .map((transaction) => transaction.amount.abs())
  )

  return {
    accountBalance,
    investmentsTotal,
    cryptoTotal,
    openBills,
    netWorth: accountBalance.plus(investmentsTotal).plus(cryptoTotal),
    monthlyInflow: inflow,
    monthlyOutflow: outflow,
    monthlyNet: inflow.minus(outflow),
    counts: {
      accounts: accounts.length,
      transactions: transactions.length,
      bills: bills.length,
      investments: investments.length,
      cryptoAssets: cryptoAssets.length,
    },
  }
}

export async function getCashFlowMetrics(searchParams: URLSearchParams) {
  const from =
    parseDateParam(searchParams.get("from")) ??
    new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)
  const to = parseDateParam(searchParams.get("to")) ?? new Date()
  const groupBy = searchParams.get("groupBy") === "day" ? "day" : "month"

  const transactions = await prisma.domainTransaction.findMany({
    where: {
      occurredAt: {
        gte: from,
        lte: to,
      },
      ignored: false,
    },
    orderBy: { occurredAt: "asc" },
  })

  const buckets = new Map<
    string,
    { inflow: Prisma.Decimal; outflow: Prisma.Decimal; net: Prisma.Decimal }
  >()

  for (const transaction of transactions) {
    const date = transaction.occurredAt
    const key =
      groupBy === "day"
        ? date.toISOString().slice(0, 10)
        : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

    const current = buckets.get(key) ?? {
      inflow: new Prisma.Decimal(0),
      outflow: new Prisma.Decimal(0),
      net: new Prisma.Decimal(0),
    }

    if (transaction.direction === DomainTransactionDirection.INFLOW) {
      current.inflow = current.inflow.plus(transaction.amount)
    } else if (transaction.direction === DomainTransactionDirection.OUTFLOW) {
      current.outflow = current.outflow.plus(transaction.amount.abs())
    }

    current.net = current.inflow.minus(current.outflow)
    buckets.set(key, current)
  }

  return Array.from(buckets.entries()).map(([period, values]) => ({
    period,
    ...values,
  }))
}

export async function getNetWorthMetrics() {
  const [overview, snapshots] = await Promise.all([
    getOverviewMetrics(),
    prisma.portfolioSnapshot.findMany({
      orderBy: { date: "asc" },
      take: 120,
    }),
  ])

  const points = snapshots.map((snapshot) => ({
    date: snapshot.date,
    netWorth: snapshot.netWorth,
    source: "snapshot",
  }))

  points.push({
    date: new Date(),
    netWorth: overview.netWorth,
    source: "current",
  })

  return {
    current: overview.netWorth,
    points,
  }
}
