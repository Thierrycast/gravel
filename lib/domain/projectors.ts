import {
  DomainAccountKind,
  DomainCategoryKind,
  DomainTransactionDirection,
  OpsRunStatus,
  Prisma,
  RuleMatchType,
  SourceProvider,
} from "@prisma/client"

import { markDomainSyncState } from "@/lib/admin/ops"
import { prisma } from "@/lib/prisma"

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() ?? null
}

function evaluateRule(
  matchType: RuleMatchType,
  ruleValue: string,
  candidate?: string | null
) {
  if (!candidate) return false

  switch (matchType) {
    case RuleMatchType.EXACT:
      return candidate === ruleValue
    case RuleMatchType.CONTAINS:
      return candidate.includes(ruleValue)
    case RuleMatchType.PREFIX:
      return candidate.startsWith(ruleValue)
    case RuleMatchType.REGEX:
      try {
        return new RegExp(ruleValue, "i").test(candidate)
      } catch {
        return false
      }
  }
}

function mapPluggyAccountKind(type?: string | null): DomainAccountKind {
  switch (type) {
    case "BANK":
      return DomainAccountKind.BANK
    case "CASH":
      return DomainAccountKind.CASH
    case "CREDIT":
    case "CARD":
      return DomainAccountKind.CARD
    case "INVESTMENT":
      return DomainAccountKind.INVESTMENT
    case "CRYPTO":
      return DomainAccountKind.CRYPTO
    default:
      return DomainAccountKind.OTHER
  }
}

function mapCategoryKind(sourceName?: string | null) {
  const normalized = normalizeText(sourceName)
  if (!normalized) return DomainCategoryKind.OTHER
  if (
    normalized.includes("income") ||
    normalized.includes("renda") ||
    normalized.includes("salary")
  ) {
    return DomainCategoryKind.INCOME
  }
  if (
    normalized.includes("transfer") ||
    normalized.includes("pix") ||
    normalized.includes("ted")
  ) {
    return DomainCategoryKind.TRANSFER
  }
  return DomainCategoryKind.EXPENSE
}

async function ensureDefaultCategories() {
  const defaults = [
    {
      slug: "uncategorized-income",
      name: "Sem categoria de entrada",
      kind: DomainCategoryKind.INCOME,
    },
    {
      slug: "uncategorized-expense",
      name: "Sem categoria de saida",
      kind: DomainCategoryKind.EXPENSE,
    },
    {
      slug: "uncategorized-transfer",
      name: "Sem categoria de transferencia",
      kind: DomainCategoryKind.TRANSFER,
    },
  ]

  for (const category of defaults) {
    await prisma.domainCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        kind: category.kind,
      },
      create: category,
    })
  }
}

async function ensureMerchant(input: {
  displayName: string
  cnpj?: string | null
  sourceExternalId?: string | null
  sourceProvider: SourceProvider
}) {
  const normalizedName = normalizeText(input.displayName) ?? "merchant"

  const existingBySource =
    input.sourceExternalId &&
    (await prisma.domainMerchantSource.findUnique({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: input.sourceProvider,
          sourceExternalId: input.sourceExternalId,
        },
      },
    }))

  if (existingBySource) {
    return prisma.domainMerchant.findUnique({
      where: { id: existingBySource.domainMerchantId },
    })
  }

  let merchant =
    (input.cnpj
      ? await prisma.domainMerchant.findUnique({
          where: { cnpj: input.cnpj },
        })
      : null) ??
    (await prisma.domainMerchant.findUnique({
      where: { normalizedName },
    }))

  if (!merchant) {
    merchant = await prisma.domainMerchant.create({
      data: {
        displayName: input.displayName,
        normalizedName,
        cnpj: input.cnpj ?? undefined,
      },
    })
  } else if (merchant.displayName !== input.displayName && !merchant.cnpj) {
    merchant = await prisma.domainMerchant.update({
      where: { id: merchant.id },
      data: {
        displayName: merchant.displayName || input.displayName,
      },
    })
  }

  if (input.sourceExternalId) {
    await prisma.domainMerchantSource.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: input.sourceProvider,
          sourceExternalId: input.sourceExternalId,
        },
      },
      update: {
        domainMerchantId: merchant.id,
        sourceName: input.displayName,
        sourceCnpj: input.cnpj ?? undefined,
      },
      create: {
        domainMerchantId: merchant.id,
        sourceProvider: input.sourceProvider,
        sourceExternalId: input.sourceExternalId,
        sourceName: input.displayName,
        sourceCnpj: input.cnpj ?? undefined,
      },
    })
  }

  return merchant
}

async function resolveMerchantFromRules(input: {
  sourceProvider: SourceProvider
  merchantName?: string | null
  merchantCnpj?: string | null
}) {
  const rules = await prisma.merchantAliasRule.findMany({
    where: {
      active: true,
      OR: [{ provider: input.sourceProvider }, { provider: null }],
    },
    orderBy: [{ updatedAt: "desc" }],
  })

  const merchantName = normalizeText(input.merchantName)
  const merchantCnpj = input.merchantCnpj ?? null

  for (const rule of rules) {
    const candidate =
      merchantCnpj && rule.matchValue === merchantCnpj
        ? merchantCnpj
        : merchantName

    if (!evaluateRule(rule.matchType, rule.matchValue, candidate)) {
      continue
    }

    if (rule.merchantId) {
      const merchant = await prisma.domainMerchant.findUnique({
        where: { id: rule.merchantId },
      })
      if (merchant) return merchant
    }

    if (rule.aliasName) {
      return ensureMerchant({
        displayName: rule.aliasName,
        cnpj: input.merchantCnpj,
        sourceProvider: input.sourceProvider,
      })
    }
  }

  if (input.merchantName) {
    return ensureMerchant({
      displayName: input.merchantName,
      cnpj: input.merchantCnpj,
      sourceProvider: input.sourceProvider,
    })
  }

  return null
}

async function resolveCategoryId(input: {
  sourceProvider: SourceProvider
  providerCategoryId?: string | null
  merchantName?: string | null
  merchantCnpj?: string | null
  description?: string | null
  amount?: Prisma.Decimal | null
}) {
  const rules = await prisma.categoryRule.findMany({
    where: {
      active: true,
      OR: [{ provider: input.sourceProvider }, { provider: null }],
    },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  })

  const candidates: Record<string, string | null> = {
    providerCategoryId: input.providerCategoryId ?? null,
    merchantCnpj: input.merchantCnpj ?? null,
    merchantName: normalizeText(input.merchantName),
    description: normalizeText(input.description),
  }

  for (const rule of rules) {
    const candidate = candidates[rule.matchField]
    if (!evaluateRule(rule.matchType, rule.matchValue, candidate)) continue
    if (rule.domainCategoryId) return rule.domainCategoryId
  }

  if (input.providerCategoryId) {
    const providerCategory = await prisma.domainCategory.findFirst({
      where: {
        sourceProvider: input.sourceProvider,
        sourceExternalId: input.providerCategoryId,
      },
    })
    if (providerCategory) return providerCategory.id
  }

  const fallbackSlug =
    input.amount && input.amount.greaterThanOrEqualTo(0)
      ? "uncategorized-income"
      : "uncategorized-expense"

  const fallback = await prisma.domainCategory.findUnique({
    where: { slug: fallbackSlug },
  })
  return fallback?.id ?? null
}

async function projectPluggyCategories() {
  const records = await prisma.pluggyCategoryRecord.findMany()
  let projected = 0

  for (const record of records) {
    const slug = `pluggy-${record.externalId}`
    await prisma.domainCategory.upsert({
      where: { slug },
      update: {
        name:
          record.descriptionTranslated ??
          record.description ??
          `Categoria ${record.externalId}`,
        kind: mapCategoryKind(record.descriptionTranslated ?? record.description),
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
      },
      create: {
        slug,
        name:
          record.descriptionTranslated ??
          record.description ??
          `Categoria ${record.externalId}`,
        kind: mapCategoryKind(record.descriptionTranslated ?? record.description),
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
      },
    })
    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:categories",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

async function projectPluggyAccounts() {
  const records = await prisma.pluggyAccountRecord.findMany()
  let projected = 0

  for (const record of records) {
    const domainAccount = await prisma.domainAccount.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        name: record.name ?? record.externalId,
        normalizedName: normalizeText(record.name) ?? undefined,
        kind: mapPluggyAccountKind(record.type),
        currencyCode: record.currencyCode ?? "BRL",
        balance: record.balance ?? undefined,
        sourceParentId: record.itemExternalId,
        ownerName: record.owner ?? undefined,
        institutionName: "Pluggy",
        metadataJson: JSON.stringify({
          subtype: record.subtype,
          number: record.number,
          taxNumber: record.taxNumber,
        }),
      },
      create: {
        name: record.name ?? record.externalId,
        normalizedName: normalizeText(record.name) ?? undefined,
        kind: mapPluggyAccountKind(record.type),
        currencyCode: record.currencyCode ?? "BRL",
        balance: record.balance ?? undefined,
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.itemExternalId,
        ownerName: record.owner ?? undefined,
        institutionName: "Pluggy",
        metadataJson: JSON.stringify({
          subtype: record.subtype,
          number: record.number,
          taxNumber: record.taxNumber,
        }),
      },
    })

    await prisma.domainAccountSource.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        domainAccountId: domainAccount.id,
        sourceParentId: record.itemExternalId,
      },
      create: {
        domainAccountId: domainAccount.id,
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.itemExternalId,
      },
    })

    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:accounts",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

async function projectPluggyMerchants() {
  const records = await prisma.pluggyMerchantRecord.findMany()
  let projected = 0

  for (const record of records) {
    await ensureMerchant({
      displayName: record.businessName ?? record.name ?? record.cnpj,
      cnpj: record.cnpj,
      sourceExternalId: record.externalId ?? record.cnpj,
      sourceProvider: SourceProvider.PLUGGY,
    })
    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:merchants",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

async function projectPluggyTransactions() {
  const records = await prisma.pluggyTransactionRecord.findMany({
    orderBy: { date: "asc" },
  })
  let projected = 0

  for (const record of records) {
    const account = await prisma.domainAccount.findUnique({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.accountExternalId,
        },
      },
    })

    const merchant = await resolveMerchantFromRules({
      sourceProvider: SourceProvider.PLUGGY,
      merchantName: record.merchantName,
      merchantCnpj: record.merchantCnpj,
    })

    const amount = record.amount ?? new Prisma.Decimal(0)
    const categoryId = await resolveCategoryId({
      sourceProvider: SourceProvider.PLUGGY,
      providerCategoryId: record.categoryId,
      merchantName: record.merchantName,
      merchantCnpj: record.merchantCnpj,
      description: record.description,
      amount,
    })

    const transaction = await prisma.domainTransaction.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        occurredAt: record.date ?? record.createdAt,
        description: record.description,
        normalizedDescription:
          normalizeText(record.description ?? record.descriptionRaw) ?? undefined,
        amount,
        currencyCode: record.currencyCode ?? "BRL",
        direction:
          amount.greaterThanOrEqualTo(0)
            ? DomainTransactionDirection.INFLOW
            : DomainTransactionDirection.OUTFLOW,
        sourceParentId: record.accountExternalId,
        domainAccountId: account?.id,
        domainMerchantId: merchant?.id,
        providerCategoryId: record.categoryId ?? undefined,
        merchantName: record.merchantName ?? undefined,
        merchantCnpj: record.merchantCnpj ?? undefined,
        metadataJson: JSON.stringify({
          providerCode: record.providerCode,
          providerId: record.providerId,
          status: record.status,
          type: record.type,
        }),
        ...(categoryId ? { domainCategoryId: categoryId } : {}),
      },
      create: {
        occurredAt: record.date ?? record.createdAt,
        description: record.description,
        normalizedDescription:
          normalizeText(record.description ?? record.descriptionRaw) ?? undefined,
        amount,
        currencyCode: record.currencyCode ?? "BRL",
        direction:
          amount.greaterThanOrEqualTo(0)
            ? DomainTransactionDirection.INFLOW
            : DomainTransactionDirection.OUTFLOW,
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.accountExternalId,
        domainAccountId: account?.id,
        domainMerchantId: merchant?.id,
        domainCategoryId: categoryId ?? undefined,
        providerCategoryId: record.categoryId ?? undefined,
        merchantName: record.merchantName ?? undefined,
        merchantCnpj: record.merchantCnpj ?? undefined,
        metadataJson: JSON.stringify({
          providerCode: record.providerCode,
          providerId: record.providerId,
          status: record.status,
          type: record.type,
        }),
      },
    })

    await prisma.domainTransactionSource.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        domainTransactionId: transaction.id,
        sourceParentId: record.accountExternalId,
      },
      create: {
        domainTransactionId: transaction.id,
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.accountExternalId,
      },
    })

    projected += 1
  }

  const ignored = await prisma.ignoredTransaction.findMany()
  for (const current of ignored) {
    await prisma.domainTransaction.updateMany({
      where: { id: current.domainTransactionId },
      data: { ignored: true },
    })
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:transactions",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

async function projectPluggyBills() {
  const records = await prisma.pluggyBillRecord.findMany()
  let projected = 0

  for (const record of records) {
    const account = record.accountExternalId
      ? await prisma.domainAccount.findUnique({
          where: {
            sourceProvider_sourceExternalId: {
              sourceProvider: SourceProvider.PLUGGY,
              sourceExternalId: record.accountExternalId,
            },
          },
        })
      : null

    await prisma.domainBill.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        sourceParentId: record.accountExternalId ?? undefined,
        domainAccountId: account?.id,
        dueDate: record.dueDate ?? undefined,
        totalAmount: record.totalAmount ?? undefined,
        minimumPaymentAmount: record.minimumPaymentAmount ?? undefined,
        currencyCode: record.totalAmountCurrencyCode ?? undefined,
        allowsInstallments: record.allowsInstallments ?? undefined,
      },
      create: {
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.accountExternalId ?? undefined,
        domainAccountId: account?.id,
        dueDate: record.dueDate ?? undefined,
        totalAmount: record.totalAmount ?? undefined,
        minimumPaymentAmount: record.minimumPaymentAmount ?? undefined,
        currencyCode: record.totalAmountCurrencyCode ?? undefined,
        allowsInstallments: record.allowsInstallments ?? undefined,
        status: "OPEN",
      },
    })

    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:bills",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

async function projectPluggyInvestments() {
  const records = await prisma.pluggyInvestmentRecord.findMany()
  let projected = 0

  for (const record of records) {
    await prisma.domainInvestment.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      },
      update: {
        name: record.name ?? record.externalId,
        type: record.type ?? undefined,
        subtype: record.subtype ?? undefined,
        balance: record.balance ?? undefined,
        currencyCode: record.currencyCode ?? undefined,
        status: record.status ?? undefined,
        sourceParentId: record.itemExternalId,
        metadataJson: JSON.stringify({
          amountOriginal: record.amountOriginal,
          amountProfit: record.amountProfit,
        }),
      },
      create: {
        name: record.name ?? record.externalId,
        type: record.type ?? undefined,
        subtype: record.subtype ?? undefined,
        balance: record.balance ?? undefined,
        currencyCode: record.currencyCode ?? undefined,
        status: record.status ?? undefined,
        sourceProvider: SourceProvider.PLUGGY,
        sourceExternalId: record.externalId,
        sourceParentId: record.itemExternalId,
        metadataJson: JSON.stringify({
          amountOriginal: record.amountOriginal,
          amountProfit: record.amountProfit,
        }),
      },
    })

    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:investments",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return projected
}

function computeAverageCostByAsset(
  trades: Array<{
    baseAsset: string | null
    price: Prisma.Decimal
    quantity: Prisma.Decimal
    isBuyer: boolean | null
  }>
) {
  const aggregates = new Map<string, { qty: Prisma.Decimal; cost: Prisma.Decimal }>()

  for (const trade of trades) {
    if (!trade.baseAsset) continue
    const current = aggregates.get(trade.baseAsset) ?? {
      qty: new Prisma.Decimal(0),
      cost: new Prisma.Decimal(0),
    }

    if (trade.isBuyer === false) {
      current.qty = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        current.qty.minus(trade.quantity)
      )
      current.cost = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        current.cost.minus(trade.price.mul(trade.quantity))
      )
    } else {
      current.qty = current.qty.plus(trade.quantity)
      current.cost = current.cost.plus(trade.price.mul(trade.quantity))
    }

    aggregates.set(trade.baseAsset, current)
  }

  return aggregates
}

export async function projectBinanceReadModels() {
  const latestBalances = await prisma.binanceAssetRecord.findMany({
    orderBy: { asset: "asc" },
  })
  const tradeAggregates = computeAverageCostByAsset(
    await prisma.binanceTradeRecord.findMany({
      select: {
        baseAsset: true,
        price: true,
        quantity: true,
        isBuyer: true,
      },
    })
  )

  let projected = 0

  for (const asset of latestBalances) {
    const balance = await prisma.binanceAssetBalanceSnapshot.findFirst({
      where: { asset: asset.asset },
      orderBy: { fetchedAt: "desc" },
    })
    if (!balance) continue

    const price = await prisma.binanceAssetPriceSnapshot.findFirst({
      where: { asset: asset.asset },
      orderBy: { fetchedAt: "desc" },
    })

    const aggregate = tradeAggregates.get(asset.asset)
    const avgCost =
      aggregate && aggregate.qty.greaterThan(0)
        ? aggregate.cost.div(aggregate.qty)
        : null
    const currentValue = price?.price
      ? price.price.mul(balance.total)
      : null
    const currentCost = avgCost ? avgCost.mul(balance.total) : null
    const pnl =
      currentValue && currentCost ? currentValue.minus(currentCost) : null

    await prisma.domainCryptoAsset.upsert({
      where: { asset: asset.asset },
      update: {
        quantity: balance.total,
        price: price?.price ?? undefined,
        value: currentValue ?? undefined,
        quoteAsset: price?.quoteAsset ?? undefined,
        costBasis: avgCost ?? undefined,
        pnlUnrealized: pnl ?? undefined,
        metadataJson: JSON.stringify({
          balanceSnapshotId: balance.id,
          priceSnapshotId: price?.id,
        }),
      },
      create: {
        asset: asset.asset,
        quantity: balance.total,
        price: price?.price ?? undefined,
        value: currentValue ?? undefined,
        quoteAsset: price?.quoteAsset ?? undefined,
        sourceProvider: SourceProvider.BINANCE,
        sourceExternalId: asset.asset,
        costBasis: avgCost ?? undefined,
        pnlUnrealized: pnl ?? undefined,
        metadataJson: JSON.stringify({
          balanceSnapshotId: balance.id,
          priceSnapshotId: price?.id,
        }),
      },
    })

    projected += 1
  }

  await markDomainSyncState({
    stateKey: "domain:binance:crypto-assets",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  })

  return { cryptoAssets: projected }
}

export async function projectPluggyReadModels() {
  await ensureDefaultCategories()

  const categories = await projectPluggyCategories()
  const accounts = await projectPluggyAccounts()
  const merchants = await projectPluggyMerchants()
  const transactions = await projectPluggyTransactions()
  const bills = await projectPluggyBills()
  const investments = await projectPluggyInvestments()

  return {
    categories,
    accounts,
    merchants,
    transactions,
    bills,
    investments,
  }
}

export async function rebuildAllDomainReadModels() {
  await ensureDefaultCategories()

  const [pluggy, binance] = await Promise.all([
    projectPluggyReadModels(),
    projectBinanceReadModels(),
  ])

  return {
    pluggy,
    binance,
  }
}

export async function reprocessProviderRecord(input: {
  provider: SourceProvider
  resource: string
  externalId: string
}) {
  if (input.provider === SourceProvider.PLUGGY) {
    switch (input.resource) {
      case "transaction": {
        const record = await prisma.pluggyTransactionRecord.findUnique({
          where: { externalId: input.externalId },
        })
        if (!record) throw new Error("Registro Pluggy nao encontrado")
        await projectPluggyTransactions()
        return { provider: "PLUGGY", resource: "transaction", externalId: record.externalId }
      }
      case "account": {
        const record = await prisma.pluggyAccountRecord.findUnique({
          where: { externalId: input.externalId },
        })
        if (!record) throw new Error("Registro Pluggy nao encontrado")
        await projectPluggyAccounts()
        return { provider: "PLUGGY", resource: "account", externalId: record.externalId }
      }
      default:
        throw new Error("Reprocessamento Pluggy nao suportado para esse recurso")
    }
  }

  if (input.provider === SourceProvider.BINANCE) {
    switch (input.resource) {
      case "trade":
      case "asset":
        await projectBinanceReadModels()
        return { provider: "BINANCE", resource: input.resource, externalId: input.externalId }
      default:
        throw new Error("Reprocessamento Binance nao suportado para esse recurso")
    }
  }

  throw new Error("Provider nao suportado")
}
