import { createHash } from "node:crypto"

import { Prisma } from "@prisma/client"

import {
  fetchAccountBalance,
  fetchAccounts,
  fetchBills,
  fetchCategories,
  fetchInvestments,
  fetchItem,
  fetchLoans,
  fetchMerchants,
  fetchTransactions,
} from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds, updateStoredPluggyItem } from "@/lib/pluggy-items"
import { prisma } from "@/lib/prisma"

export type SyncResource =
  | "items"
  | "accounts"
  | "balances"
  | "transactions"
  | "investments"
  | "loans"
  | "bills"
  | "categories"
  | "merchants"

type SyncOptions = {
  itemId?: string | null
  resources?: SyncResource[]
  pageSize?: number
}

type SyncCounters = Record<SyncResource, number>

const defaultResources: SyncResource[] = [
  "items",
  "accounts",
  "balances",
  "transactions",
  "investments",
  "loans",
  "bills",
  "categories",
  "merchants",
]

function createEmptyCounters(): SyncCounters {
  return {
    items: 0,
    accounts: 0,
    balances: 0,
    transactions: 0,
    investments: 0,
    loans: 0,
    bills: 0,
    categories: 0,
    merchants: 0,
  }
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

async function createIfNew(operation: () => Promise<unknown>) {
  try {
    await operation()
    return 1
  } catch (error) {
    if (isUniqueError(error)) {
      return 0
    }

    throw error
  }
}

async function createIfMissing(
  exists: () => Promise<boolean>,
  create: () => Promise<unknown>
) {
  if (await exists()) {
    return 0
  }

  return createIfNew(create)
}

function toDate(value: unknown) {
  if (!value || typeof value !== "string") {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDecimal(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Prisma.Decimal(value)
  }

  if (typeof value === "string") {
    const normalized = Number(value)
    if (Number.isFinite(normalized)) {
      return new Prisma.Decimal(normalized)
    }
  }

  return null
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function serializePayload(payload: unknown) {
  return JSON.stringify(payload)
}

function hashPayload(payload: unknown) {
  return createHash("sha256").update(serializePayload(payload)).digest("hex")
}

async function savePayloadSnapshot(input: {
  resourceType: string
  externalId: string
  payload: unknown
  itemExternalId?: string | null
  parentExternalId?: string | null
  sourceUpdatedAt?: Date | null
}) {
  const payloadHash = hashPayload(input.payload)
  return createIfMissing(
    async () =>
      Boolean(
        await prisma.pluggyPayloadSnapshot.findUnique({
          where: {
            resourceType_externalId_payloadHash: {
              resourceType: input.resourceType,
              externalId: input.externalId,
              payloadHash,
            },
          },
          select: { id: true },
        })
      ),
    () =>
      prisma.pluggyPayloadSnapshot.create({
        data: {
          resourceType: input.resourceType,
          externalId: input.externalId,
          itemExternalId: input.itemExternalId ?? undefined,
          parentExternalId: input.parentExternalId ?? undefined,
          payloadHash,
          payloadJson: serializePayload(input.payload),
          sourceUpdatedAt: input.sourceUpdatedAt ?? undefined,
        },
      })
  )
}

async function* iterateAllPages<T>(
  getPage: (page: number, pageSize: number) => Promise<{
    totalPages?: number
    results?: T[]
  }>,
  pageSize: number
) {
  const firstPage = await getPage(1, pageSize)
  
  const totalPages = Math.max(Number(firstPage?.totalPages ?? 1), 1)
  
  if (Array.isArray(firstPage?.results)) {
    for (const item of firstPage.results) {
      yield item
    }
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const currentPage = await getPage(page, pageSize)
    if (Array.isArray(currentPage?.results)) {
      for (const item of currentPage.results) {
        yield item
      }
    }
  }
}

async function syncCategories(pageSize: number) {
  const categories = iterateAllPages(
    (page, currentPageSize) => fetchCategories({ page, pageSize: currentPageSize }),
    pageSize
  )

  let inserted = 0
  let total = 0

  for await (const category of categories) {
    total += 1
    const currentCategory = category as Record<string, unknown>
    const externalId = toStringOrNull(currentCategory.id)
    if (!externalId) continue

    inserted += await savePayloadSnapshot({
      resourceType: "category",
      externalId,
      payload: currentCategory,
    })

    inserted += await createIfMissing(
      async () =>
        Boolean(
          await prisma.pluggyCategoryRecord.findUnique({
            where: { externalId },
            select: { id: true },
          })
        ),
      () =>
        prisma.pluggyCategoryRecord.create({
          data: {
            externalId,
            description: toStringOrNull(currentCategory.description),
            descriptionTranslated: toStringOrNull(
              currentCategory.descriptionTranslated
            ),
            parentId: toStringOrNull(currentCategory.parentId),
            parentDescription: toStringOrNull(currentCategory.parentDescription),
          },
        })
    )
  }

  return {
    inserted,
    total,
  }
}

async function syncItem(itemId: string) {
  const item = await fetchItem(itemId)

  await updateStoredPluggyItem({
    itemId,
    connectorId: item?.connector?.id,
    connectorName: item?.connector?.name,
    status: item?.status,
  })

  const inserted = await savePayloadSnapshot({
    resourceType: "item",
    externalId: itemId,
    payload: item,
    itemExternalId: itemId,
    sourceUpdatedAt: toDate(item?.updatedAt),
  })

  return {
    item,
    inserted,
  }
}

async function syncAccountEntity(itemId: string, account: Record<string, unknown>) {
  const externalId = toStringOrNull(account.id)
  if (!externalId) {
    return {
      inserted: 0,
    }
  }

  let inserted = 0

  inserted += await savePayloadSnapshot({
    resourceType: "account",
    externalId,
    itemExternalId: itemId,
    payload: account,
    sourceUpdatedAt: toDate(account.updatedAt),
  })

  await prisma.pluggyAccountRecord.upsert({
    where: { externalId },
    update: {
      itemExternalId: itemId,
      type: toStringOrNull(account.type),
      subtype: toStringOrNull(account.subtype),
      name: toStringOrNull(account.name),
      number: toStringOrNull(account.number),
      owner: toStringOrNull(account.owner),
      taxNumber: toStringOrNull(account.taxNumber),
      currencyCode: toStringOrNull(account.currencyCode),
      balance: toDecimal(account.balance) ?? undefined,
      providerUpdatedAt: toDate(account.updatedAt) ?? undefined,
    },
    create: {
      externalId,
      itemExternalId: itemId,
      type: toStringOrNull(account.type),
      subtype: toStringOrNull(account.subtype),
      name: toStringOrNull(account.name),
      number: toStringOrNull(account.number),
      owner: toStringOrNull(account.owner),
      taxNumber: toStringOrNull(account.taxNumber),
      currencyCode: toStringOrNull(account.currencyCode),
      balance: toDecimal(account.balance) ?? undefined,
      providerCreatedAt: toDate(account.createdAt) ?? undefined,
      providerUpdatedAt: toDate(account.updatedAt) ?? undefined,
    },
  })
  inserted += 1

  return {
    inserted,
    externalId,
  }
}

async function syncBalanceSnapshot(accountId: string) {
  try {
    const balance = await fetchAccountBalance(accountId)
    const payloadHash = hashPayload(balance)

    const inserted = await createIfMissing(
      async () =>
        Boolean(
          await prisma.pluggyAccountBalanceSnapshot.findUnique({
            where: {
              accountExternalId_payloadHash: {
                accountExternalId: accountId,
                payloadHash,
              },
            },
            select: { id: true },
          })
        ),
      () =>
        prisma.pluggyAccountBalanceSnapshot.create({
          data: {
            accountExternalId: accountId,
            balance: toDecimal(balance?.balance) ?? undefined,
            blockedBalance: toDecimal(balance?.blockedBalance) ?? undefined,
            automaticallyInvestedBalance:
              toDecimal(balance?.automaticallyInvestedBalance) ?? undefined,
            currencyCode: toStringOrNull(balance?.currencyCode),
            providerUpdatedAt: toDate(balance?.updateDateTime) ?? undefined,
            payloadHash,
            payloadJson: serializePayload(balance),
          },
        })
    )

    return inserted
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("CONNECTOR_IS_NOT_OPEN_FINANCE")) {
      return 0
    }
    if (message.includes("connector is not open finance")) {
      return 0
    }
    throw error
  }
}

async function syncBillEntity(
  itemId: string,
  accountId: string,
  bill: Record<string, unknown>
) {
  const externalId = toStringOrNull(bill.id)
  if (!externalId) return 0

  let inserted = 0

  inserted += await savePayloadSnapshot({
    resourceType: "bill",
    externalId,
    itemExternalId: itemId,
    parentExternalId: accountId,
    payload: bill,
    sourceUpdatedAt: toDate(bill.updatedAt),
  })

  await prisma.pluggyBillRecord.upsert({
    where: { externalId },
    update: {
      itemExternalId: itemId,
      accountExternalId: accountId,
      dueDate: toDate(bill.dueDate) ?? undefined,
      totalAmount: toDecimal(bill.totalAmount) ?? undefined,
      totalAmountCurrencyCode: toStringOrNull(bill.totalAmountCurrencyCode),
      minimumPaymentAmount:
        toDecimal(bill.minimumPaymentAmount) ?? undefined,
      allowsInstallments:
        typeof bill.allowsInstallments === "boolean"
          ? bill.allowsInstallments
          : undefined,
      providerUpdatedAt: toDate(bill.updatedAt) ?? undefined,
    },
    create: {
      externalId,
      itemExternalId: itemId,
      accountExternalId: accountId,
      dueDate: toDate(bill.dueDate) ?? undefined,
      totalAmount: toDecimal(bill.totalAmount) ?? undefined,
      totalAmountCurrencyCode: toStringOrNull(bill.totalAmountCurrencyCode),
      minimumPaymentAmount:
        toDecimal(bill.minimumPaymentAmount) ?? undefined,
      allowsInstallments:
        typeof bill.allowsInstallments === "boolean"
          ? bill.allowsInstallments
          : undefined,
      providerCreatedAt: toDate(bill.createdAt) ?? undefined,
      providerUpdatedAt: toDate(bill.updatedAt) ?? undefined,
    },
  })
  inserted += 1

  return inserted
}

async function syncTransactionEntity(
  itemId: string,
  accountId: string,
  transaction: Record<string, unknown>
) {
  const externalId = toStringOrNull(transaction.id)
  if (!externalId) {
    return {
      inserted: 0,
      merchantCnpj: null as string | null,
    }
  }

  let inserted = 0

  inserted += await savePayloadSnapshot({
    resourceType: "transaction",
    externalId,
    itemExternalId: itemId,
    parentExternalId: accountId,
    payload: transaction,
    sourceUpdatedAt: toDate(transaction.updatedAt),
  })

  const merchant = transaction.merchant as Record<string, unknown> | null
  const merchantCnpj = toStringOrNull(merchant?.cnpj)
  const merchantName =
    toStringOrNull(merchant?.businessName) ?? toStringOrNull(merchant?.name)

  await prisma.pluggyTransactionRecord.upsert({
    where: { externalId },
    update: {
      itemExternalId: itemId,
      accountExternalId: accountId,
      description: toStringOrNull(transaction.description),
      descriptionRaw: toStringOrNull(transaction.descriptionRaw),
      currencyCode: toStringOrNull(transaction.currencyCode),
      amount: toDecimal(transaction.amount) ?? undefined,
      date: toDate(transaction.date) ?? undefined,
      type: toStringOrNull(transaction.type),
      status: toStringOrNull(transaction.status),
      categoryId: toStringOrNull(transaction.categoryId),
      category: toStringOrNull(transaction.category),
      providerCode: toStringOrNull(transaction.providerCode),
      providerId: toStringOrNull(transaction.providerId),
      merchantCnpj,
      merchantName,
      providerUpdatedAt: toDate(transaction.updatedAt) ?? undefined,
    },
    create: {
      externalId,
      itemExternalId: itemId,
      accountExternalId: accountId,
      description: toStringOrNull(transaction.description),
      descriptionRaw: toStringOrNull(transaction.descriptionRaw),
      currencyCode: toStringOrNull(transaction.currencyCode),
      amount: toDecimal(transaction.amount) ?? undefined,
      date: toDate(transaction.date) ?? undefined,
      type: toStringOrNull(transaction.type),
      status: toStringOrNull(transaction.status),
      categoryId: toStringOrNull(transaction.categoryId),
      category: toStringOrNull(transaction.category),
      providerCode: toStringOrNull(transaction.providerCode),
      providerId: toStringOrNull(transaction.providerId),
      merchantCnpj,
      merchantName,
      providerCreatedAt: toDate(transaction.createdAt) ?? undefined,
      providerUpdatedAt: toDate(transaction.updatedAt) ?? undefined,
    },
  })
  inserted += 1

  return {
    inserted,
    merchantCnpj,
  }
}

async function syncInvestmentEntity(itemId: string, investment: Record<string, unknown>) {
  const externalId = toStringOrNull(investment.id)
  if (!externalId) return 0

  let inserted = 0

  inserted += await savePayloadSnapshot({
    resourceType: "investment",
    externalId,
    itemExternalId: itemId,
    payload: investment,
    sourceUpdatedAt: toDate(investment.updatedAt),
  })

  inserted += await createIfMissing(
    async () =>
      Boolean(
        await prisma.pluggyInvestmentRecord.findUnique({
          where: { externalId },
          select: { id: true },
        })
      ),
    () =>
      prisma.pluggyInvestmentRecord.create({
        data: {
          externalId,
          itemExternalId: itemId,
          name: toStringOrNull(investment.name),
          type: toStringOrNull(investment.type),
          subtype: toStringOrNull(investment.subtype),
          status: toStringOrNull(investment.status),
          currencyCode: toStringOrNull(investment.currencyCode),
          balance: toDecimal(investment.balance) ?? undefined,
          amountOriginal: toDecimal(investment.amountOriginal) ?? undefined,
          amountProfit: toDecimal(investment.amountProfit) ?? undefined,
          providerCreatedAt: toDate(investment.createdAt) ?? undefined,
          providerUpdatedAt: toDate(investment.updatedAt) ?? undefined,
        },
      })
  )

  return inserted
}

async function syncLoanEntity(itemId: string, loan: Record<string, unknown>) {
  const externalId = toStringOrNull(loan.id)
  if (!externalId) return 0

  let inserted = 0

  inserted += await savePayloadSnapshot({
    resourceType: "loan",
    externalId,
    itemExternalId: itemId,
    payload: loan,
    sourceUpdatedAt: toDate(loan.updatedAt),
  })

  inserted += await createIfMissing(
    async () =>
      Boolean(
        await prisma.pluggyLoanRecord.findUnique({
          where: { externalId },
          select: { id: true },
        })
      ),
    () =>
      prisma.pluggyLoanRecord.create({
        data: {
          externalId,
          itemExternalId: itemId,
          contractNumber: toStringOrNull(loan.contractNumber),
          productName: toStringOrNull(loan.productName),
          contractAmount: toDecimal(loan.contractAmount) ?? undefined,
          currencyCode: toStringOrNull(loan.currencyCode),
          dueDate: toDate(loan.dueDate) ?? undefined,
          installmentPeriodicity: toStringOrNull(loan.installmentPeriodicity),
          status: toStringOrNull(loan.status),
          providerCreatedAt: toDate(loan.createdAt) ?? undefined,
          providerUpdatedAt: toDate(loan.updatedAt) ?? undefined,
        },
      })
  )

  return inserted
}

async function syncMerchantEntity(cnpj: string) {
  const existing = await prisma.pluggyMerchantRecord.findUnique({
    where: { cnpj },
    select: { id: true },
  })

  if (existing) {
    return 0
  }

  const response = await fetchMerchants({ cnpj })
  const merchants = Array.isArray(response?.foundMerchants)
    ? response.foundMerchants
    : []

  let inserted = 0

  for (const merchant of merchants) {
    const merchantCnpj = toStringOrNull(merchant?.cnpj) ?? cnpj

    inserted += await savePayloadSnapshot({
      resourceType: "merchant",
      externalId: merchantCnpj,
      payload: merchant,
      parentExternalId: merchantCnpj,
    })

    inserted += await createIfMissing(
      async () =>
        Boolean(
          await prisma.pluggyMerchantRecord.findUnique({
            where: { cnpj: merchantCnpj },
            select: { id: true },
          })
        ),
      () =>
        prisma.pluggyMerchantRecord.create({
          data: {
            cnpj: merchantCnpj,
            externalId: toStringOrNull(merchant?.id),
            name: toStringOrNull(merchant?.name),
            businessName: toStringOrNull(merchant?.businessName),
            category: toStringOrNull(merchant?.category),
            cnae: toStringOrNull(merchant?.cnae),
          },
        })
    )
  }

  return inserted
}

export async function syncPluggyData(options: SyncOptions = {}) {
  const resources = options.resources?.length
    ? options.resources
    : defaultResources
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 200
  const counters = createEmptyCounters()
  const before = await getPluggyPersistenceSummary()

  const run = await prisma.pluggySyncRun.create({
    data: {
      scope: options.itemId ? "single-item" : "all-items",
      resources: resources.join(","),
      status: "RUNNING",
    },
  })

  try {
    const itemIds = await resolveStoredPluggyItemIds(options.itemId)
    const merchantCnpjs = new Set<string>()

    if (resources.includes("categories")) {
      const categoryResult = await syncCategories(pageSize)
      counters.categories += categoryResult.inserted
    }

    for (const itemId of itemIds) {
      const itemResult = await syncItem(itemId)
      counters.items += itemResult.inserted

      if (itemResult.item?.status !== "UPDATED") {
        continue
      }

      const accounts = iterateAllPages(
        (page, currentPageSize) =>
          fetchAccounts({ itemId, page, pageSize: currentPageSize }),
        pageSize
      )

      for await (const account of accounts) {
        const accountResult = await syncAccountEntity(
          itemId,
          account as Record<string, unknown>
        )
        counters.accounts += accountResult.inserted

        const accountId = accountResult.externalId
        if (!accountId) continue

        if (resources.includes("balances")) {
          counters.balances += await syncBalanceSnapshot(accountId)
        }

        if (resources.includes("bills")) {
          const bills = iterateAllPages(
            (page, currentPageSize) =>
              fetchBills({ accountId, page, pageSize: currentPageSize }),
            pageSize
          )

          for await (const bill of bills) {
            counters.bills += await syncBillEntity(
              itemId,
              accountId,
              bill as Record<string, unknown>
            )
          }
        }

        if (resources.includes("transactions")) {
          const transactions = iterateAllPages(
            (page, currentPageSize) =>
              fetchTransactions({
                accountId,
                page,
                pageSize: currentPageSize,
              }),
            pageSize
          )

          for await (const transaction of transactions) {
            const transactionResult = await syncTransactionEntity(
              itemId,
              accountId,
              transaction as Record<string, unknown>
            )

            counters.transactions += transactionResult.inserted

            if (transactionResult.merchantCnpj) {
              merchantCnpjs.add(transactionResult.merchantCnpj)
            }
          }
        }
      }

      if (resources.includes("investments")) {
        const investments = iterateAllPages(
          (page, currentPageSize) =>
            fetchInvestments({ itemId, page, pageSize: currentPageSize }),
          pageSize
        )

        for await (const investment of investments) {
          counters.investments += await syncInvestmentEntity(
            itemId,
            investment as Record<string, unknown>
          )
        }
      }

      if (resources.includes("loans")) {
        const loans = iterateAllPages(
          (page, currentPageSize) =>
            fetchLoans({ itemId, page, pageSize: currentPageSize }),
          pageSize
        )

        for await (const loan of loans) {
          counters.loans += await syncLoanEntity(
            itemId,
            loan as Record<string, unknown>
          )
        }
      }
    }

    if (resources.includes("merchants")) {
      for (const cnpj of merchantCnpjs) {
        counters.merchants += await syncMerchantEntity(cnpj)
      }
    }

    const after = await getPluggyPersistenceSummary()
    const summary = {
      itemCount: (await resolveStoredPluggyItemIds(options.itemId)).length,
      inserted: {
        items: after.items - before.items,
        accounts: after.accounts - before.accounts,
        balances: after.balances - before.balances,
        transactions: after.transactions - before.transactions,
        investments: after.investments - before.investments,
        loans: after.loans - before.loans,
        bills: after.bills - before.bills,
        categories: after.categories - before.categories,
        merchants: after.merchants - before.merchants,
        snapshots: after.snapshots - before.snapshots,
      },
      writes: counters,
    }

    await prisma.pluggySyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        summaryJson: JSON.stringify(summary),
        finishedAt: new Date(),
      },
    })

    return summary
  } catch (error) {
    await prisma.pluggySyncRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        finishedAt: new Date(),
      },
    })

    throw error
  }
}

/**
 * Triggers an incremental sync for a single Pluggy item.
 * Used by the webhook handler to process per-item events.
 */
export async function syncPluggyItem(itemId: string) {
  return syncPluggyData({ itemId })
}

export async function getPluggyPersistenceSummary() {
  const [
    items,
    accounts,
    balances,
    transactions,
    investments,
    loans,
    bills,
    categories,
    merchants,
    snapshots,
    latestRun,
  ] = await Promise.all([
    prisma.pluggyItem.count(),
    prisma.pluggyAccountRecord.count(),
    prisma.pluggyAccountBalanceSnapshot.count(),
    prisma.pluggyTransactionRecord.count(),
    prisma.pluggyInvestmentRecord.count(),
    prisma.pluggyLoanRecord.count(),
    prisma.pluggyBillRecord.count(),
    prisma.pluggyCategoryRecord.count(),
    prisma.pluggyMerchantRecord.count(),
    prisma.pluggyPayloadSnapshot.count(),
    prisma.pluggySyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
  ])

  return {
    items,
    accounts,
    balances,
    transactions,
    investments,
    loans,
    bills,
    categories,
    merchants,
    snapshots,
    latestRun,
  }
}
