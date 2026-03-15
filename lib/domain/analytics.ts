import {
  DomainAccountKind,
  DomainTransactionDirection,
  Prisma,
  SourceProvider,
} from "@prisma/client"

import {
  normalizePagination,
  parseBooleanParam,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters"
import { computeCryptoPositionStates } from "@/lib/domain/crypto-math"
import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)

type DecimalLike = Prisma.Decimal | null | undefined

type MetricFilters = {
  page: number
  pageSize: number
  skip: number
  take: number
  from?: Date
  to?: Date
  period?: string
  accountId?: string
  categoryId?: string
  merchantId?: string
  provider?: SourceProvider
  asset?: string
  sortBy?: string
  sortOrder: "asc" | "desc"
  groupBy: "day" | "week" | "month"
  includeIgnored: boolean
  limit: number
}

function decimal(value?: DecimalLike) {
  return value ?? ZERO
}

function sumDecimals(values: DecimalLike[]) {
  return values.reduce(
    (total: Prisma.Decimal, current) => total.plus(decimal(current)),
    ZERO
  )
}

function safeDivide(value: Prisma.Decimal, denominator: Prisma.Decimal) {
  if (denominator.equals(0)) return null
  return value.div(denominator)
}

function percentOf(value: Prisma.Decimal, total: Prisma.Decimal) {
  if (total.equals(0)) return ZERO
  return value.div(total).mul(100)
}

function clampDateToPeriodStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function resolvePeriodStart(period: string | null, to: Date) {
  switch (period) {
    case "7d":
      return new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    case "30d":
      return new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
    case "90d":
      return new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000)
    case "180d":
      return new Date(to.getTime() - 180 * 24 * 60 * 60 * 1000)
    case "365d":
    case "12m":
      return new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000)
    case "mtd":
    case "month":
      return clampDateToPeriodStart(to)
    case "ytd":
      return new Date(Date.UTC(to.getUTCFullYear(), 0, 1))
    case "all":
    default:
      return undefined
  }
}

function getWeekStart(date: Date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = current.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  current.setUTCDate(current.getUTCDate() + diff)
  return current
}

function formatBucket(date: Date, groupBy: MetricFilters["groupBy"]) {
  if (groupBy === "day") return date.toISOString().slice(0, 10)
  if (groupBy === "week") return getWeekStart(date).toISOString().slice(0, 10)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function buildMetricFilters(searchParams: URLSearchParams, defaults?: {
  period?: string
  groupBy?: MetricFilters["groupBy"]
  limit?: number
}) {
  const to = parseDateParam(searchParams.get("to")) ?? new Date()
  const period = searchParams.get("period") ?? defaults?.period
  const from = parseDateParam(searchParams.get("from")) ?? resolvePeriodStart(period ?? null, to)
  const page = parseNumberParam(searchParams.get("page"), 1) ?? 1
  const pageSize = parseNumberParam(searchParams.get("pageSize"), 50) ?? 50
  const pagination = normalizePagination(page, pageSize)
  const providerParam = searchParams.get("provider")

  return {
    ...pagination,
    from,
    to,
    period: period ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    merchantId: searchParams.get("merchantId") ?? undefined,
    provider: providerParam ? (providerParam.toUpperCase() as SourceProvider) : undefined,
    asset: searchParams.get("asset")?.toUpperCase() ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
    groupBy:
      searchParams.get("groupBy") === "day"
        ? "day"
        : searchParams.get("groupBy") === "week"
          ? "week"
          : defaults?.groupBy ?? "month",
    includeIgnored: parseBooleanParam(searchParams.get("ignored")),
    limit: parseNumberParam(searchParams.get("limit"), defaults?.limit ?? 10) ?? 10,
  } satisfies MetricFilters
}

function buildTransactionWhere(filters: MetricFilters): Prisma.DomainTransactionWhereInput {
  return {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
    domainMerchantId: filters.merchantId,
    sourceProvider: filters.provider,
    ...(filters.includeIgnored ? {} : { ignored: false }),
  }
}

export function parseMetricQuery(searchParams: URLSearchParams, defaults?: {
  period?: string
  groupBy?: MetricFilters["groupBy"]
  limit?: number
}) {
  return buildMetricFilters(searchParams, defaults)
}

export async function getOverviewMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "mtd",
  })

  const [accounts, bills, investments, cryptoAssets, transactions, loans] =
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
      prisma.domainTransaction.findMany({
        where: buildTransactionWhere(filters),
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
  const loanBalance = sumDecimals(loans.map((loan) => loan.contractAmount))
  const liabilitiesTotal = openBills.plus(loanBalance)
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
    loanBalance,
    liabilitiesTotal,
    grossAssets: accountBalance.plus(investmentsTotal).plus(cryptoTotal),
    netWorth: accountBalance
      .plus(investmentsTotal)
      .plus(cryptoTotal)
      .minus(liabilitiesTotal),
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
      transactions: transactions.length,
      bills: bills.length,
      investments: investments.length,
      cryptoAssets: cryptoAssets.length,
    },
  }
}

export async function getCashFlowMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "180d",
    groupBy: "month",
  })

  const transactions = await prisma.domainTransaction.findMany({
    where: buildTransactionWhere(filters),
    orderBy: { occurredAt: "asc" },
  })

  const buckets = new Map<
    string,
    {
      inflow: Prisma.Decimal
      outflow: Prisma.Decimal
      net: Prisma.Decimal
      transactions: number
    }
  >()

  for (const transaction of transactions) {
    const key = formatBucket(transaction.occurredAt, filters.groupBy)
    const current = buckets.get(key) ?? {
      inflow: ZERO,
      outflow: ZERO,
      net: ZERO,
      transactions: 0,
    }

    if (transaction.direction === DomainTransactionDirection.INFLOW) {
      current.inflow = current.inflow.plus(transaction.amount)
    } else if (transaction.direction === DomainTransactionDirection.OUTFLOW) {
      current.outflow = current.outflow.plus(transaction.amount.abs())
    }

    current.transactions += 1
    current.net = current.inflow.minus(current.outflow)
    buckets.set(key, current)
  }

  return Array.from(buckets.entries()).map(([period, values]) => ({
    period,
    ...values,
  }))
}

export async function getNetWorthMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "12m",
  })
  const [overview, snapshots] = await Promise.all([
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
    appliedFilters: {
      from: filters.from,
      to: filters.to,
    },
  }
}

export async function getAccountAllocationMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, { limit: 20 })
  const accounts = await prisma.domainAccount.findMany({
    where: {
      sourceProvider: filters.provider,
    },
    orderBy: [{ balance: "desc" }, { name: "asc" }],
  })

  const positiveAccounts = accounts.filter(
    (account) => account.balance && account.balance.greaterThan(0)
  )
  const total = sumDecimals(positiveAccounts.map((account) => account.balance))

  const byAccount = positiveAccounts.slice(0, filters.limit).map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    institutionName: account.institutionName,
    sourceProvider: account.sourceProvider,
    balance: decimal(account.balance),
    sharePercent: percentOf(decimal(account.balance), total),
  }))

  const byKindMap = new Map<DomainAccountKind, Prisma.Decimal>()
  for (const account of positiveAccounts) {
    const current = byKindMap.get(account.kind) ?? ZERO
    byKindMap.set(account.kind, current.plus(decimal(account.balance)))
  }

  const byKind = Array.from(byKindMap.entries())
    .map(([kind, balance]) => ({
      kind,
      balance,
      sharePercent: percentOf(balance, total),
    }))
    .sort((left, right) => right.balance.comparedTo(left.balance))

  return {
    total,
    byAccount,
    byKind,
    counts: {
      totalAccounts: accounts.length,
      positiveAccounts: positiveAccounts.length,
    },
  }
}

export async function getBillsSummaryMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, { limit: 12 })
  const now = new Date()
  const dueIn7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dueIn30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const hasDateWindow =
    searchParams.has("from") || searchParams.has("to") || searchParams.has("period")

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
  })

  const totalAmount = sumDecimals(bills.map((bill) => bill.totalAmount))
  const minimumPayment = sumDecimals(
    bills.map((bill) => bill.minimumPaymentAmount)
  )
  const overdue = bills.filter((bill) => bill.dueDate && bill.dueDate < now)
  const upcoming = bills.slice(0, filters.limit)

  return {
    totalAmount,
    minimumPayment,
    overdueAmount: sumDecimals(overdue.map((bill) => bill.totalAmount)),
    dueIn7DaysAmount: sumDecimals(
      bills
        .filter((bill) => bill.dueDate && bill.dueDate >= now && bill.dueDate <= dueIn7)
        .map((bill) => bill.totalAmount)
    ),
    dueIn30DaysAmount: sumDecimals(
      bills
        .filter((bill) => bill.dueDate && bill.dueDate >= now && bill.dueDate <= dueIn30)
        .map((bill) => bill.totalAmount)
    ),
    counts: {
      bills: bills.length,
      overdue: overdue.length,
    },
    upcoming,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
    },
  }
}

export async function getSpendingByCategoryMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "mtd",
    limit: 12,
  })
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
    },
    orderBy: [{ occurredAt: "desc" }],
  })

  const categories = await prisma.domainCategory.findMany()
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const groups = new Map<
    string,
    {
      categoryId: string | null
      name: string
      amount: Prisma.Decimal
      count: number
      averageAmount: Prisma.Decimal
    }
  >()

  for (const transaction of transactions) {
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null
    const key = transaction.domainCategoryId ?? "uncategorized"
    const current = groups.get(key) ?? {
      categoryId: transaction.domainCategoryId,
      name: category?.name ?? "Sem categoria",
      amount: ZERO,
      count: 0,
      averageAmount: ZERO,
    }

    current.amount = current.amount.plus(transaction.amount.abs())
    current.count += 1
    current.averageAmount = current.amount.div(current.count)
    groups.set(key, current)
  }

  const total = sumDecimals(Array.from(groups.values()).map((group) => group.amount))
  const results = Array.from(groups.values())
    .map((group) => ({
      ...group,
      sharePercent: percentOf(group.amount, total),
    }))
    .sort((left, right) => right.amount.comparedTo(left.amount))
    .slice(0, filters.limit)

  return {
    total,
    results,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
      categoryId: filters.categoryId,
      accountId: filters.accountId,
    },
  }
}

export async function getSpendingByMerchantMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "mtd",
    limit: 12,
  })
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ...buildTransactionWhere(filters),
      direction: DomainTransactionDirection.OUTFLOW,
    },
    orderBy: [{ occurredAt: "desc" }],
  })

  const merchants = await prisma.domainMerchant.findMany()
  const merchantMap = new Map(merchants.map((merchant) => [merchant.id, merchant]))
  const groups = new Map<
    string,
    {
      merchantId: string | null
      name: string
      cnpj: string | null
      amount: Prisma.Decimal
      count: number
      averageAmount: Prisma.Decimal
    }
  >()

  for (const transaction of transactions) {
    const merchant = transaction.domainMerchantId
      ? merchantMap.get(transaction.domainMerchantId)
      : null
    const key = transaction.domainMerchantId ?? transaction.merchantName ?? "unknown"
    const current = groups.get(key) ?? {
      merchantId: transaction.domainMerchantId,
      name: merchant?.displayName ?? transaction.merchantName ?? "Nao identificado",
      cnpj: merchant?.cnpj ?? transaction.merchantCnpj ?? null,
      amount: ZERO,
      count: 0,
      averageAmount: ZERO,
    }

    current.amount = current.amount.plus(transaction.amount.abs())
    current.count += 1
    current.averageAmount = current.amount.div(current.count)
    groups.set(key, current)
  }

  const total = sumDecimals(Array.from(groups.values()).map((group) => group.amount))
  const results = Array.from(groups.values())
    .map((group) => ({
      ...group,
      sharePercent: percentOf(group.amount, total),
    }))
    .sort((left, right) => right.amount.comparedTo(left.amount))
    .slice(0, filters.limit)

  return {
    total,
    results,
    appliedFilters: {
      from: filters.from,
      to: filters.to,
      merchantId: filters.merchantId,
      accountId: filters.accountId,
    },
  }
}

export async function getCryptoAssetMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "all",
    limit: 50,
  })

  const assetWhere = filters.asset
    ? {
        asset: filters.asset,
      }
    : undefined

  const [total, assetRecords] = await Promise.all([
    prisma.binanceAssetRecord.count({
      where: assetWhere,
    }),
    prisma.binanceAssetRecord.findMany({
      where: assetWhere,
      orderBy: { asset: "asc" },
    }),
  ])

  const assetNames = assetRecords.map((record) => record.asset)

  const [trades, balanceSnapshots, priceSnapshots] = await Promise.all([
    prisma.binanceTradeRecord.findMany({
      where: {
        baseAsset: assetNames.length > 0 ? { in: assetNames } : filters.asset,
        tradedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
    }),
    prisma.binanceAssetBalanceSnapshot.findMany({
      where: {
        asset: assetNames.length > 0 ? { in: assetNames } : filters.asset,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
    prisma.binanceAssetPriceSnapshot.findMany({
      where: {
        asset: assetNames.length > 0 ? { in: assetNames } : filters.asset,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
  ])

  const priceMap = new Map<string, (typeof priceSnapshots)[number]>()
  for (const price of priceSnapshots) {
    if (!priceMap.has(price.asset)) {
      priceMap.set(price.asset, price)
    }
  }
  const balanceMap = new Map<string, (typeof balanceSnapshots)[number]>()
  for (const balance of balanceSnapshots) {
    if (!balanceMap.has(balance.asset)) {
      balanceMap.set(balance.asset, balance)
    }
  }

  const states = computeCryptoPositionStates(trades, {
    asset: filters.asset,
    from: filters.from,
    to: filters.to,
  })

  const allResults = assetRecords.map((assetRecord) => {
    const state = states.get(assetRecord.asset)
    const price = priceMap.get(assetRecord.asset)
    const balance = balanceMap.get(assetRecord.asset)
    const quantity = balance?.total ?? state?.quantity ?? ZERO
    const currentPrice = price?.price ?? null
    const currentValue = currentPrice ? currentPrice.mul(quantity) : null
    const totalCostBasis = state?.averageCost ? state.averageCost.mul(quantity) : null
    const unrealizedPnl = currentValue && totalCostBasis
      ? currentValue.minus(totalCostBasis)
      : null
    const unrealizedPnlPercent = unrealizedPnl && totalCostBasis && !totalCostBasis.equals(0)
      ? unrealizedPnl.div(totalCostBasis).mul(100)
      : null

    return {
      asset: assetRecord.asset,
      quoteAsset: price?.quoteAsset ?? state?.quoteAsset ?? null,
      quantity,
      currentPrice,
      currentValue,
      averageCost: state?.averageCost ?? null,
      totalCostBasis,
      unrealizedPnl,
      unrealizedPnlPercent,
      realizedPnl: state?.realizedPnl ?? ZERO,
      periodRealizedPnl: state?.periodRealizedPnl ?? ZERO,
      periodTradeCount: state?.periodTradeCount ?? 0,
      periodBuyCount: state?.periodBuyCount ?? 0,
      periodSellCount: state?.periodSellCount ?? 0,
      periodBuyQuantity: state?.periodBuyQuantity ?? ZERO,
      periodSellQuantity: state?.periodSellQuantity ?? ZERO,
      averageBuyPrice: state && state.periodBuyQuantity.greaterThan(0)
        ? state.periodBuyNotional.div(state.periodBuyQuantity)
        : null,
      averageSellPrice: state && state.periodSellQuantity.greaterThan(0)
        ? state.periodSellNotional.div(state.periodSellQuantity)
        : null,
      firstTradeAt: state?.firstTradeAt ?? null,
      lastTradeAt: state?.lastTradeAt ?? null,
      tradeCount: state?.tradeCount ?? 0,
    }
  })

  const results = allResults.slice(filters.skip, filters.skip + filters.take)
  const totalValue = sumDecimals(allResults.map((item) => item.currentValue))
  const totalCostBasis = sumDecimals(allResults.map((item) => item.totalCostBasis))
  const totalUnrealizedPnl = sumDecimals(allResults.map((item) => item.unrealizedPnl))

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
      totalUnrealizedPnlPercent: safeDivide(totalUnrealizedPnl.mul(100), totalCostBasis),
      appliedFilters: {
        from: filters.from,
        to: filters.to,
        asset: filters.asset,
      },
    },
  }
}

export async function getCryptoPortfolioMetrics(searchParams: URLSearchParams) {
  const payload = await getCryptoAssetMetrics(searchParams)
  const assets = payload.allResults.filter((asset) => asset.currentValue !== null)
  const totalValue = sumDecimals(assets.map((asset) => asset.currentValue))
  const totalCostBasis = sumDecimals(assets.map((asset) => asset.totalCostBasis))
  const totalUnrealizedPnl = sumDecimals(assets.map((asset) => asset.unrealizedPnl))
  const totalRealizedPnl = sumDecimals(assets.map((asset) => asset.realizedPnl))
  const allocations = assets
    .map((asset) => ({
      asset: asset.asset,
      value: asset.currentValue,
      sharePercent: percentOf(decimal(asset.currentValue), totalValue),
    }))
    .sort((left, right) => decimal(right.value).comparedTo(decimal(left.value)))

  const orderedByPnl = [...assets].sort((left, right) =>
    decimal(right.unrealizedPnl).comparedTo(decimal(left.unrealizedPnl))
  )

  return {
    totalValue,
    totalCostBasis,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalUnrealizedPnlPercent: safeDivide(totalUnrealizedPnl.mul(100), totalCostBasis),
    assets: assets.length,
    allocations,
    bestPerformer: orderedByPnl[0] ?? null,
    worstPerformer: orderedByPnl.at(-1) ?? null,
    appliedFilters: payload.summary.appliedFilters,
  }
}
