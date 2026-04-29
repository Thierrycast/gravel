import {
  Prisma,
} from "@prisma/client"

import {
  normalizePagination,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters"
import { buildTransactionDisplay } from "@/lib/domain/enrichment/display"
import { deriveInstitutionFromNames, getInstitutionLogo } from "@/lib/domain/utils"
import { prisma } from "@/lib/prisma"

/** Resolves a period shorthand into a start Date. Must stay in sync with analytics.ts resolvePeriodStart. */
function resolvePeriodFrom(period: string | null, to: Date): Date | undefined {
  switch (period) {
    case "7d": return new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    case "30d": return new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
    case "90d": return new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000)
    case "180d": return new Date(to.getTime() - 180 * 24 * 60 * 60 * 1000)
    case "365d":
    case "12m": return new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000)
    case "mtd":
    case "month": {
      const d = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
      return d
    }
    case "ytd": return new Date(Date.UTC(to.getUTCFullYear(), 0, 1))
    case "all":
    default: return undefined
  }
}

export function parseDomainQuery(searchParams: URLSearchParams) {
  const directionParam = searchParams.get("direction")?.trim().toUpperCase()
  const to = parseDateParam(searchParams.get("to")) ?? new Date()
  const period = searchParams.get("period") ?? undefined
  const from = parseDateParam(searchParams.get("from")) ?? resolvePeriodFrom(period ?? null, to)

  return {
    page: parseNumberParam(searchParams.get("page"), 1) ?? 1,
    pageSize: parseNumberParam(searchParams.get("pageSize"), 50) ?? 50,
    from,
    to,
    period,
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    merchantId: searchParams.get("merchantId") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    asset: searchParams.get("asset") ?? undefined,
    q: searchParams.get("q")?.trim() || searchParams.get("search")?.trim() || undefined,
    direction:
      directionParam === "INFLOW" || directionParam === "INCOME"
        ? "INFLOW"
        : directionParam === "OUTFLOW" || directionParam === "EXPENSE"
          ? "OUTFLOW"
          : undefined,
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
  let searchWhere: Prisma.DomainTransactionWhereInput[] | undefined
  let categoryFilterIds: string[] | undefined

  if (filters.q) {
    const [categories, accounts, merchants] = await Promise.all([
      prisma.domainCategory.findMany({
        where: {
          name: { contains: filters.q },
        },
        select: { id: true },
      }),
      prisma.domainAccount.findMany({
        where: {
          name: { contains: filters.q },
        },
        select: { id: true },
      }),
      prisma.domainMerchant.findMany({
        where: {
          displayName: { contains: filters.q },
        },
        select: { id: true },
      }),
    ])

    const categoryIds = categories.map((category) => category.id)
    const accountIds = accounts.map((account) => account.id)
    const merchantIds = merchants.map((merchant) => merchant.id)

    searchWhere = [
      {
        description: {
          contains: filters.q,
        },
      },
      {
        normalizedDescription: {
          contains: filters.q.toLowerCase(),
        },
      },
      {
        merchantName: {
          contains: filters.q,
        },
      },
      ...(categoryIds.length > 0
        ? [{ domainCategoryId: { in: categoryIds } satisfies Prisma.StringFilter }]
        : []),
      ...(accountIds.length > 0
        ? [{ domainAccountId: { in: accountIds } satisfies Prisma.StringNullableFilter }]
        : []),
      ...(merchantIds.length > 0
        ? [{ domainMerchantId: { in: merchantIds } satisfies Prisma.StringNullableFilter }]
        : []),
    ]
  }

  if (filters.categoryId) {
    const categories = await prisma.domainCategory.findMany({
      select: { id: true, parentId: true },
    })
    const childrenByParent = new Map<string, string[]>()
    for (const category of categories) {
      if (!category.parentId) continue
      childrenByParent.set(category.parentId, [
        ...(childrenByParent.get(category.parentId) ?? []),
        category.id,
      ])
    }
    const ids = new Set<string>([filters.categoryId])
    const queue = [filters.categoryId]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      for (const childId of childrenByParent.get(current) ?? []) {
        if (ids.has(childId)) continue
        ids.add(childId)
        queue.push(childId)
      }
    }
    categoryFilterIds = Array.from(ids)
  }

  const where: Prisma.DomainTransactionWhereInput = {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: categoryFilterIds ? { in: categoryFilterIds } : undefined,
    domainMerchantId: filters.merchantId,
    direction: filters.direction,
    sourceProvider: filters.provider ? (filters.provider as never) : undefined,
    ...(searchWhere ? { OR: searchWhere } : {}),
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

export async function getDashboardTransactions(searchParams: URLSearchParams) {
  const payload = await getDomainTransactions(searchParams)

  const categoryIds = Array.from(
    new Set(
      payload.results
        .map((transaction) => transaction.domainCategoryId)
        .filter((value): value is string => Boolean(value))
    )
  )
  const accountIds = Array.from(
    new Set(
      payload.results
        .map((transaction) => transaction.domainAccountId)
        .filter((value): value is string => Boolean(value))
    )
  )
  const merchantIds = Array.from(
    new Set(
      payload.results
        .map((transaction) => transaction.domainMerchantId)
        .filter((value): value is string => Boolean(value))
    )
  )

  const [categories, accounts, merchants, merchantEnrichments, transactionEnrichments] = await Promise.all([
    prisma.domainCategory.findMany({
      where: categoryIds.length > 0 ? {} : { id: "__none__" },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.domainAccount.findMany({
      where: accountIds.length > 0 ? { id: { in: accountIds } } : { id: "__none__" },
      select: { id: true, name: true, institutionName: true, sourceParentId: true },
    }),
    prisma.domainMerchant.findMany({
      where: merchantIds.length > 0 ? { id: { in: merchantIds } } : { id: "__none__" },
      select: { id: true, displayName: true },
    }),
    prisma.merchantEnrichment.findMany({
      where: merchantIds.length > 0 ? { domainMerchantId: { in: merchantIds } } : { id: "__none__" },
      select: { domainMerchantId: true, logoUrl: true, status: true },
    }),
    prisma.transactionEnrichment.findMany({
      where: payload.results.length > 0 ? { domainTransactionId: { in: payload.results.map((tx) => tx.id) } } : { id: "__none__" },
      select: { domainTransactionId: true, status: true },
    }),
  ])

  const categoryMap = new Map(categories.map((category) => [category.id, category]))

  // Derive real institution names from grouped account names (MeuPluggy proxy has no brand)
  const accountNamesByParent = new Map<string, string[]>()
  for (const account of accounts) {
    if (!account.sourceParentId) continue
    const bucket = accountNamesByParent.get(account.sourceParentId) ?? []
    bucket.push(account.name)
    accountNamesByParent.set(account.sourceParentId, bucket)
  }
  const institutionByParent = new Map<string, string | null>()
  for (const [parentId, names] of accountNamesByParent.entries()) {
    institutionByParent.set(parentId, deriveInstitutionFromNames(names))
  }
  const accountMap = new Map(accounts.map((account) => {
    const groupInstitution = account.sourceParentId ? (institutionByParent.get(account.sourceParentId) ?? null) : null
    const storedName = account.institutionName && !["Pluggy", "MeuPluggy", "PLUGGY"].includes(account.institutionName) ? account.institutionName : null
    const institution = groupInstitution ?? storedName ?? null
    return [account.id, { name: account.name, imageUrl: getInstitutionLogo(institution ?? account.name) }]
  }))

  const merchantMap = new Map(merchants.map((merchant) => [merchant.id, merchant]))
  const merchantEnrichmentMap = new Map(merchantEnrichments.map((item) => [item.domainMerchantId, item]))
  const transactionEnrichmentMap = new Map(transactionEnrichments.map((item) => [item.domainTransactionId, item]))

  const mapped = payload.results.map((tx) => {
    const accountInfo = tx.domainAccountId ? accountMap.get(tx.domainAccountId) : null
    const category = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null
    const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null
    const merchant = tx.domainMerchantId ? merchantMap.get(tx.domainMerchantId) : null
    const merchantEnrichment = tx.domainMerchantId
      ? merchantEnrichmentMap.get(tx.domainMerchantId)
      : null
    const transactionEnrichment = transactionEnrichmentMap.get(tx.id)
    
    return {
      ...buildTransactionDisplay(tx, {
        category,
        parentCategory,
        merchant,
        merchantLogoUrl: merchantEnrichment?.logoUrl ?? null,
        enrichmentStatus: transactionEnrichment?.status ?? merchantEnrichment?.status ?? null,
      }),
      accountId: tx.domainAccountId,
      accountName: accountInfo?.name ?? "",
      accountImageUrl: accountInfo?.imageUrl ?? null,
    }
  })

  return {
    summary: {
      total: payload.total,
    },
    results: mapped,
    meta: {
      page: payload.page,
      pageSize: payload.pageSize,
      totalPages: Math.max(1, Math.ceil(payload.total / payload.pageSize)),
    },
  }
}

export async function getUserSettings(searchParams?: URLSearchParams) {
  const setting = await prisma.userSetting.findFirst()

  const base = {
    monthlySalary: setting ? Number(setting.monthlySalary) : 0,
    showFutureSalary: setting ? setting.showFutureSalary : true,
    showFutureAccounts: setting ? setting.showFutureAccounts : true,
  }

  if (searchParams) {
    const showFutureSalary = searchParams.get("showFutureSalary")
    if (showFutureSalary !== null) {
      base.showFutureSalary = showFutureSalary === "true"
    }

    const showFutureAccounts = searchParams.get("showFutureAccounts")
    if (showFutureAccounts !== null) {
      base.showFutureAccounts = showFutureAccounts === "true"
    }
  }

  return base
}
