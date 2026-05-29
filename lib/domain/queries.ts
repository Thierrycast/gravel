import {
  Prisma,
} from "@prisma/client"

import {
  normalizePagination,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters"
import { isInternalAccountTransfer } from "@/lib/domain/analytics/shared"
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
    merchantId:
      searchParams.get("merchantId") === "null" || searchParams.get("merchantId") === "undefined"
        ? null
        : (searchParams.get("merchantId") ?? undefined),
    provider: searchParams.get("provider") ?? undefined,
    asset: searchParams.get("asset") ?? undefined,
    minAmount: parseNumberParam(searchParams.get("minAmount")),
    maxAmount: parseNumberParam(searchParams.get("maxAmount")),
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

    // Check if query is a valid number to filter by amount
    const amountQuery = Number(filters.q.replace(",", "."))
    const isValidAmount = !isNaN(amountQuery) && filters.q.trim() !== ""

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
      ...(isValidAmount
        ? [
            {
              amount: {
                equals: new Prisma.Decimal(amountQuery).abs(),
              },
            },
          ]
        : []),
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
  }

  const where: Prisma.DomainTransactionWhereInput = {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
    domainMerchantId: filters.merchantId,
    amount: {
      gte: filters.minAmount ?? undefined,
      lte: filters.maxAmount ?? undefined,
    },
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

const SELF_TRANSFER_CATEGORY_NAME = "Transferência entre minhas contas"
const SELF_TRANSFER_MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

type DashboardCategoryInfo = {
  id: string
  name: string
  parentId: string | null
  kind?: string | null
}

type DashboardAccountInfo = {
  name: string
  imageUrl: string | null
}

type TransferCandidate = {
  id: string
  occurredAt: Date
  amount: Prisma.Decimal
  direction: string
  domainAccountId: string | null
  domainCategoryId: string | null
}

type SelfTransferRoute = {
  title: string
  subtitle: string
  fromAccountName: string | null
  fromAccountImageUrl: string | null
  toAccountName: string | null
  toAccountImageUrl: string | null
}

function normalizeTransferLookup(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? ""
  )
}

function parseSalaryPatterns(configJson?: string | null) {
  if (!configJson) return []
  try {
    const config = JSON.parse(configJson) as { salaryPatterns?: unknown }
    return Array.isArray(config.salaryPatterns)
      ? config.salaryPatterns.filter(
          (pattern): pattern is string =>
            typeof pattern === "string" && pattern.trim().length > 0,
        )
      : []
  } catch {
    return []
  }
}

function isSalaryCategoryName(value?: string | null) {
  const normalized = normalizeTransferLookup(value)
  return normalized === "salario" || normalized.includes("salary")
}

function matchesSalaryPattern(
  transaction: {
    description?: string | null
    merchantName?: string | null
  },
  salaryPatterns: string[],
) {
  if (salaryPatterns.length === 0) return false
  const lookup = normalizeTransferLookup(
    [transaction.description, transaction.merchantName].filter(Boolean).join(" "),
  )
  if (!lookup) return false
  return salaryPatterns.some((pattern) => {
    const normalizedPattern = normalizeTransferLookup(pattern)
    return (
      normalizedPattern.length > 0 &&
      (lookup.includes(normalizedPattern) || normalizedPattern.includes(lookup))
    )
  })
}

function amountCents(amount: Prisma.Decimal | number | string) {
  return Math.round(Math.abs(Number(amount)) * 100)
}

function hasTransferSignal(
  transaction: Pick<TransferCandidate, "direction">,
  category?: DashboardCategoryInfo | null,
) {
  const categoryName = category?.name ?? null
  const normalizedCategory = normalizeTransferLookup(categoryName)
  return (
    transaction.direction === "TRANSFER" ||
    isInternalAccountTransfer(categoryName) ||
    normalizedCategory.includes("transfer")
  )
}

function hasInternalAccountTransferCategory(category?: DashboardCategoryInfo | null) {
  return isInternalAccountTransfer(category?.name)
}

function directionsCanBeSelfTransferPair(left: TransferCandidate, right: TransferCandidate) {
  if (
    (left.direction === "OUTFLOW" && right.direction === "INFLOW") ||
    (left.direction === "INFLOW" && right.direction === "OUTFLOW")
  ) {
    return true
  }

  return left.direction === "TRANSFER" || right.direction === "TRANSFER"
}

async function resolveSelfTransferRoutes(
  transactions: TransferCandidate[],
  categoryMap: Map<string, DashboardCategoryInfo>,
  accountMap: Map<string, DashboardAccountInfo>,
) {
  const possibleTransfers = transactions.filter((transaction) => {
    if (!transaction.domainAccountId) return false
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null
    return hasTransferSignal(transaction, category)
  })

  if (possibleTransfers.length === 0) {
    return new Map<string, SelfTransferRoute>()
  }

  const timestamps = possibleTransfers.map((transaction) =>
    transaction.occurredAt.getTime(),
  )
  const from = new Date(Math.min(...timestamps) - SELF_TRANSFER_MATCH_WINDOW_MS)
  const to = new Date(Math.max(...timestamps) + SELF_TRANSFER_MATCH_WINDOW_MS)
  const candidates = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      occurredAt: {
        gte: from,
        lte: to,
      },
    },
    select: {
      id: true,
      occurredAt: true,
      amount: true,
      direction: true,
      domainAccountId: true,
      domainCategoryId: true,
    },
  })

  const missingAccountIds = Array.from(
    new Set(
      candidates
        .map((candidate) => candidate.domainAccountId)
        .filter((value): value is string => Boolean(value))
        .filter((value) => !accountMap.has(value)),
    ),
  )

  if (missingAccountIds.length > 0) {
    const peerAccounts = await prisma.domainAccount.findMany({
      where: { id: { in: missingAccountIds } },
      select: { id: true, name: true, institutionName: true },
    })

    for (const account of peerAccounts) {
      const storedName =
        account.institutionName && !["Pluggy", "MeuPluggy", "PLUGGY"].includes(account.institutionName)
          ? account.institutionName
          : null
      const institution = storedName ?? deriveInstitutionFromNames([account.name])
      accountMap.set(account.id, {
        name: account.name,
        imageUrl: getInstitutionLogo(institution ?? account.name),
      })
    }
  }

  const candidatesByAmount = new Map<number, TransferCandidate[]>()
  for (const candidate of candidates) {
    if (!candidate.domainAccountId) continue
    const key = amountCents(candidate.amount)
    candidatesByAmount.set(key, [...(candidatesByAmount.get(key) ?? []), candidate])
  }

  const routes = new Map<string, SelfTransferRoute>()
  for (const transaction of possibleTransfers) {
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null
    const strongInternalCategory = hasInternalAccountTransferCategory(category)
    const peers = candidatesByAmount.get(amountCents(transaction.amount)) ?? []
    let bestPeer: TransferCandidate | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const peer of peers) {
      if (peer.id === transaction.id) continue
      if (!peer.domainAccountId || peer.domainAccountId === transaction.domainAccountId) continue
      if (!directionsCanBeSelfTransferPair(transaction, peer)) continue

      const delta = Math.abs(peer.occurredAt.getTime() - transaction.occurredAt.getTime())
      if (delta > SELF_TRANSFER_MATCH_WINDOW_MS) continue

      const peerCategory = peer.domainCategoryId
        ? categoryMap.get(peer.domainCategoryId)
        : null
      if (!hasTransferSignal(peer, peerCategory) && !strongInternalCategory) continue

      const peerCategoryBonus = hasInternalAccountTransferCategory(peerCategory) ? 0 : 1
      const score = delta + peerCategoryBonus
      if (score < bestScore) {
        bestPeer = peer
        bestScore = score
      }
    }

    if (!strongInternalCategory && !bestPeer) continue

    const currentAccount = transaction.domainAccountId
      ? accountMap.get(transaction.domainAccountId) ?? null
      : null
    const peerAccount = bestPeer?.domainAccountId
      ? accountMap.get(bestPeer.domainAccountId) ?? null
      : null
    const fromAccount =
      transaction.direction === "INFLOW"
        ? peerAccount
        : currentAccount
    const toAccount =
      transaction.direction === "INFLOW"
        ? currentAccount
        : peerAccount
    const title =
      fromAccount && toAccount
        ? `${fromAccount.name} → ${toAccount.name}`
        : SELF_TRANSFER_CATEGORY_NAME

    routes.set(transaction.id, {
      title,
      subtitle: SELF_TRANSFER_CATEGORY_NAME,
      fromAccountName: fromAccount?.name ?? null,
      fromAccountImageUrl: fromAccount?.imageUrl ?? null,
      toAccountName: toAccount?.name ?? null,
      toAccountImageUrl: toAccount?.imageUrl ?? null,
    })
  }

  return routes
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
  const transactionIds = payload.results.map((transaction) => transaction.id)

  const [
    categories,
    accounts,
    merchants,
    merchantEnrichments,
    transactionEnrichments,
    userSetting,
    linkedLends,
  ] = await Promise.all([
    prisma.domainCategory.findMany({
      where: categoryIds.length > 0 ? {} : { id: "__none__" },
      select: { id: true, name: true, parentId: true, kind: true },
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
      where: transactionIds.length > 0 ? { domainTransactionId: { in: transactionIds } } : { id: "__none__" },
      select: { domainTransactionId: true, status: true },
    }),
    prisma.userSetting.findFirst({
      where: { id: "default" },
      select: { dashboardConfigJson: true },
    }),
    prisma.domainLend.findMany({
      where: transactionIds.length > 0
        ? {
            OR: [
              { domainTransactionId: { in: transactionIds } },
              { inflowTransactionId: { in: transactionIds } },
            ],
          }
        : { id: "__none__" },
      select: {
        id: true,
        friendName: true,
        amount: true,
        dueDate: true,
        status: true,
        domainTransactionId: true,
        inflowTransactionId: true,
      },
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
  const salaryPatterns = parseSalaryPatterns(userSetting?.dashboardConfigJson)
  const lendByTransactionId = new Map<
    string,
    {
      id: string
      friendName: string
      amount: Prisma.Decimal
      dueDate: Date
      status: string
      role: "loan-outflow" | "payment-inflow"
    }
  >()
  for (const lend of linkedLends) {
    if (lend.domainTransactionId) {
      lendByTransactionId.set(lend.domainTransactionId, {
        id: lend.id,
        friendName: lend.friendName,
        amount: lend.amount,
        dueDate: lend.dueDate,
        status: lend.status,
        role: "loan-outflow",
      })
    }
    if (lend.inflowTransactionId) {
      lendByTransactionId.set(lend.inflowTransactionId, {
        id: lend.id,
        friendName: lend.friendName,
        amount: lend.amount,
        dueDate: lend.dueDate,
        status: lend.status,
        role: "payment-inflow",
      })
    }
  }
  const selfTransferRoutes = await resolveSelfTransferRoutes(
    payload.results,
    categoryMap,
    accountMap,
  )

  const mapped = payload.results.map((tx) => {
    const accountInfo = tx.domainAccountId ? accountMap.get(tx.domainAccountId) : null
    const category = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null
    const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null
    const merchant = tx.domainMerchantId ? merchantMap.get(tx.domainMerchantId) : null
    const merchantEnrichment = tx.domainMerchantId
      ? merchantEnrichmentMap.get(tx.domainMerchantId)
      : null
    const transactionEnrichment = transactionEnrichmentMap.get(tx.id)
    const selfTransferRoute = selfTransferRoutes.get(tx.id)
    const linkedLend = lendByTransactionId.get(tx.id)
    const isSalary =
      tx.direction === "INFLOW" &&
      (isSalaryCategoryName(category?.name) ||
        isSalaryCategoryName(parentCategory?.name) ||
        matchesSalaryPattern(tx, salaryPatterns))
    const display = buildTransactionDisplay(tx, {
      category,
      parentCategory,
      merchant,
      merchantLogoUrl: merchantEnrichment?.logoUrl ?? null,
      enrichmentStatus: transactionEnrichment?.status ?? merchantEnrichment?.status ?? null,
    })
    
    return {
      ...display,
      ...(selfTransferRoute
        ? {
            displayTitle: selfTransferRoute.title,
            displaySubtitle:
              display.rawDescription && display.rawDescription !== selfTransferRoute.title
                ? display.rawDescription
                : selfTransferRoute.subtitle,
            categoryName: SELF_TRANSFER_CATEGORY_NAME,
            effectiveCategory: SELF_TRANSFER_CATEGORY_NAME,
            merchantLogoUrl: null,
            isSelfTransfer: true,
            transferFromAccountName: selfTransferRoute.fromAccountName,
            transferFromAccountImageUrl: selfTransferRoute.fromAccountImageUrl,
            transferToAccountName: selfTransferRoute.toAccountName,
            transferToAccountImageUrl: selfTransferRoute.toAccountImageUrl,
          }
        : {}),
      isSalary,
      linkedLend: linkedLend
        ? {
            id: linkedLend.id,
            friendName: linkedLend.friendName,
            amount: Number(linkedLend.amount),
            dueDate: linkedLend.dueDate,
            status: linkedLend.status,
            role: linkedLend.role,
          }
        : null,
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

  let salaryPatterns: string[] = []
  if (setting?.dashboardConfigJson) {
    try {
      const parsed = JSON.parse(setting.dashboardConfigJson)
      if (Array.isArray(parsed.salaryPatterns)) {
        salaryPatterns = parsed.salaryPatterns
      }
    } catch {}
  }

  let calculatedSalary = setting ? Number(setting.monthlySalary) : 0

  if (salaryPatterns.length > 0) {
    let sum = 0
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    for (const pattern of salaryPatterns) {
      const lastTx = await prisma.domainTransaction.findFirst({
        where: {
          direction: "INFLOW",
          occurredAt: { gte: cutoff },
          OR: [
            { description: { contains: pattern } },
            { merchantName: { contains: pattern } },
          ],
        },
        orderBy: { occurredAt: "desc" },
      })

      if (lastTx) {
        sum += Number(lastTx.amount)
      }
    }
    if (sum > 0) {
      calculatedSalary = sum
    }
  }

  const base = {
    monthlySalary: calculatedSalary,
    showFutureSalary: setting ? setting.showFutureSalary : true,
    showFutureAccounts: setting ? setting.showFutureAccounts : true,
    salaryPatterns,
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
