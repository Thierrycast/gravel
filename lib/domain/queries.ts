import {
  Prisma,
} from "@prisma/client"

import {
  normalizePagination,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters"
import { prisma } from "@/lib/prisma"

export function parseDomainQuery(searchParams: URLSearchParams) {
  const directionParam = searchParams.get("direction")?.trim().toUpperCase()

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

  const where: Prisma.DomainTransactionWhereInput = {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
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
