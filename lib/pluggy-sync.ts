import { createHash } from "node:crypto"

import { Prisma, SourceProvider } from "@prisma/client"

import { updateCheckpoint } from "@/lib/admin/ops"
import {
  fetchAccountBalance,
  fetchAccounts,
  fetchBills,
  fetchCategories,
  fetchInvestments,
  fetchItem,
  fetchLoans,
  fetchMerchantsByCnpjList,
  fetchTransactionsByCursor,
  maxMerchantCnpjsPerRequest,
} from "@/lib/integrations/pluggy"
import { resolveTransactionWindow } from "@/lib/ingestion/transaction-window"
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
  // Quando true, dispara PATCH /items/{id} e aguarda a sincronização na
  // instituição antes de reler os dados (refresh de verdade, não só GET).
  refresh?: boolean
  // Quando true, ignora o checkpoint de cada conta e relê 12 meses de
  // transações (backfill/reconciliação). Por padrão o sync é incremental.
  full?: boolean
  // Janela em dias usada quando a conta ainda não tem checkpoint. Padrão: o
  // `syncLookbackDays` do UserSetting.
  lookbackDays?: number
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

function toInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
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

    // Upsert (não create-if-missing): a Pluggy renomeia e reorganiza categorias,
    // e um registro criado uma vez só nunca acompanharia isso.
    const categoryData = {
      description: toStringOrNull(currentCategory.description),
      descriptionTranslated: toStringOrNull(
        currentCategory.descriptionTranslated
      ),
      parentId: toStringOrNull(currentCategory.parentId),
      parentDescription: toStringOrNull(currentCategory.parentDescription),
    }
    await prisma.pluggyCategoryRecord.upsert({
      where: { externalId },
      update: categoryData,
      create: { externalId, ...categoryData },
    })
    inserted += 1
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
    imageUrl: item?.connector?.imageUrl,
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
  transaction: Record<string, unknown>,
  accountCurrencyCode?: string | null
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentData = transaction.paymentData as Record<string, any> | null



  let merchantCnpj = toStringOrNull(merchant?.cnpj)
  if (!merchantCnpj && paymentData?.receiver?.documentNumber?.value) {
    merchantCnpj = toStringOrNull(paymentData.receiver.documentNumber.value)
  }

  let merchantName =
    toStringOrNull(merchant?.businessName) ?? toStringOrNull(merchant?.name)
  if (!merchantName && paymentData?.receiver?.name) {
    merchantName = toStringOrNull(paymentData.receiver.name)
  }

  // Compras em moeda estrangeira: a Pluggy envia `amount` na moeda original
  // (ex.: USD 21.24) e `amountInAccountCurrency` no valor realmente cobrado na
  // conta (ex.: BRL 114.34). Armazenar o valor na moeda da conta mantém todos
  // os somatórios (faturas, relatórios, KPIs) consistentes sem depender de
  // conversão por cotação do dia.
  const amountInAccountCurrency = toDecimal(transaction.amountInAccountCurrency)
  const amount =
    amountInAccountCurrency ?? toDecimal(transaction.amount) ?? undefined
  const currencyCode = amountInAccountCurrency
    ? (accountCurrencyCode ?? null)
    : toStringOrNull(transaction.currencyCode)

  // `creditCardMetadata` traz o parcelamento informado pela instituição —
  // mais confiável que inferir "3/12" da descrição.
  const cardMeta = transaction.creditCardMetadata as Record<
    string,
    unknown
  > | null

  const transactionData = {
    itemExternalId: itemId,
    accountExternalId: accountId,
    description: toStringOrNull(transaction.description),
    descriptionRaw: toStringOrNull(transaction.descriptionRaw),
    currencyCode: currencyCode,
    amount: amount,
    date: toDate(transaction.date) ?? undefined,
    type: toStringOrNull(transaction.type),
    status: toStringOrNull(transaction.status),
    categoryId: toStringOrNull(transaction.categoryId),
    category: toStringOrNull(transaction.category),
    providerCode: toStringOrNull(transaction.providerCode),
    providerId: toStringOrNull(transaction.providerId),
    merchantCnpj,
    merchantName,
    installmentNumber: toInt(cardMeta?.installmentNumber),
    totalInstallments: toInt(cardMeta?.totalInstallments),
    totalAmount: toDecimal(cardMeta?.totalAmount) ?? undefined,
    payeeMFN: toStringOrNull(cardMeta?.payeeMFN),
    cardNumber: toStringOrNull(cardMeta?.cardNumber),
    billId: toStringOrNull(cardMeta?.billId),
    providerUpdatedAt: toDate(transaction.updatedAt) ?? undefined,
  }

  await prisma.pluggyTransactionRecord.upsert({
    where: { externalId },
    update: transactionData,
    create: {
      externalId,
      ...transactionData,
      providerCreatedAt: toDate(transaction.createdAt) ?? undefined,
    },
  })
  inserted += 1

  return {
    inserted,
    merchantCnpj,
  }
}

// ── Transações: ingestão e sincronização incremental por cursor ─────────────

export type TransactionIngestResult = {
  /** Escritas efetivas (snapshots + upserts). */
  inserted: number
  /** Transações vistas no payload. */
  processed: number
  merchantCnpjs: string[]
}

/**
 * Persiste uma lista de payloads de transação já obtida da Pluggy. Usado tanto
 * pelo sync completo quanto pelo webhook (`transactions/created` e
 * `transactions/updated`), que recebem lotes prontos e não precisam paginar.
 */
export async function ingestTransactionPayloads(input: {
  itemId: string
  accountId: string
  accountCurrencyCode?: string | null
  transactions: Record<string, unknown>[]
}): Promise<TransactionIngestResult> {
  const merchantCnpjs = new Set<string>()
  let inserted = 0

  for (const transaction of input.transactions) {
    const result = await syncTransactionEntity(
      input.itemId,
      input.accountId,
      transaction,
      input.accountCurrencyCode,
    )
    inserted += result.inserted
    if (result.merchantCnpj) {
      merchantCnpjs.add(result.merchantCnpj)
    }
  }

  return {
    inserted,
    processed: input.transactions.length,
    merchantCnpjs: [...merchantCnpjs],
  }
}

const TRANSACTIONS_CHECKPOINT_RESOURCE = "transactions"

export async function getAccountTransactionsWatermark(accountId: string) {
  const checkpoint = await prisma.opsSyncCheckpoint.findUnique({
    where: {
      provider_resource_cursorKey: {
        provider: SourceProvider.PLUGGY,
        resource: TRANSACTIONS_CHECKPOINT_RESOURCE,
        cursorKey: accountId,
      },
    },
  })
  if (!checkpoint?.value) return null
  const parsed = new Date(checkpoint.value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

async function setAccountTransactionsWatermark(
  accountId: string,
  at: Date,
  meta?: unknown,
) {
  await updateCheckpoint({
    provider: SourceProvider.PLUGGY,
    resource: TRANSACTIONS_CHECKPOINT_RESOURCE,
    cursorKey: accountId,
    value: at.toISOString(),
    meta,
  })
}

/**
 * Lê as transações de uma conta pelo `GET /v2/transactions` (cursor, 500 por
 * página) e persiste. Três modos:
 *
 * - **incremental** (padrão, quando há checkpoint): `createdAtFrom` a partir do
 *   watermark menos a sobreposição — só o que a Pluggy criou desde a última vez;
 * - **janela** (sem checkpoint, ou `lookbackDays`): `dateFrom` nos últimos N dias;
 * - **backfill** (`full: true`): `dateFrom` nos últimos 12 meses.
 *
 * `createdAtFrom` e `dateFrom` são mutuamente exclusivos na API — nunca são
 * enviados juntos.
 */
export async function syncAccountTransactions(input: {
  itemId: string
  accountId: string
  accountCurrencyCode?: string | null
  full?: boolean
  lookbackDays?: number
  /** Sobrescreve o cálculo do checkpoint (usado pelo webhook). */
  createdAtFrom?: string | null
}): Promise<TransactionIngestResult & { mode: string; watermark: Date }> {
  const startedAt = new Date()
  // A escolha entre `createdAtFrom` e `dateFrom` (mutuamente exclusivos na API)
  // é pura e vive em `transaction-window.ts`.
  const { mode, ...window } = resolveTransactionWindow({
    createdAtFrom: input.createdAtFrom,
    full: input.full,
    watermark: input.createdAtFrom
      ? null
      : await getAccountTransactionsWatermark(input.accountId),
    lookbackDays: input.lookbackDays,
  })
  const query = { accountId: input.accountId, ...window }

  const merchantCnpjs = new Set<string>()
  let inserted = 0
  let processed = 0
  let after: string | null = null

  do {
    const page = await fetchTransactionsByCursor({ ...query, after })
    const result = await ingestTransactionPayloads({
      itemId: input.itemId,
      accountId: input.accountId,
      accountCurrencyCode: input.accountCurrencyCode,
      transactions: page.results,
    })
    inserted += result.inserted
    processed += result.processed
    for (const cnpj of result.merchantCnpjs) merchantCnpjs.add(cnpj)
    after = page.next
  } while (after)

  // O watermark é o instante em que a leitura começou: qualquer transação
  // criada durante o sync entra na próxima janela (com a sobreposição).
  await setAccountTransactionsWatermark(input.accountId, startedAt, {
    mode,
    processed,
    inserted,
  })

  return {
    inserted,
    processed,
    merchantCnpjs: [...merchantCnpjs],
    mode,
    watermark: startedAt,
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

  // Upsert: o saldo/rendimento de um investimento muda todo dia. Com
  // create-if-missing o valor congelava no primeiro sync.
  const investmentData = {
    itemExternalId: itemId,
    name: toStringOrNull(investment.name),
    type: toStringOrNull(investment.type),
    subtype: toStringOrNull(investment.subtype),
    status: toStringOrNull(investment.status),
    currencyCode: toStringOrNull(investment.currencyCode),
    balance: toDecimal(investment.balance) ?? undefined,
    amountOriginal: toDecimal(investment.amountOriginal) ?? undefined,
    amountProfit: toDecimal(investment.amountProfit) ?? undefined,
    providerUpdatedAt: toDate(investment.updatedAt) ?? undefined,
  }
  await prisma.pluggyInvestmentRecord.upsert({
    where: { externalId },
    update: investmentData,
    create: {
      externalId,
      ...investmentData,
      providerCreatedAt: toDate(investment.createdAt) ?? undefined,
    },
  })
  inserted += 1

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

  // Upsert: saldo devedor e status do contrato mudam a cada parcela paga.
  const loanData = {
    itemExternalId: itemId,
    contractNumber: toStringOrNull(loan.contractNumber),
    productName: toStringOrNull(loan.productName),
    contractAmount: toDecimal(loan.contractAmount) ?? undefined,
    currencyCode: toStringOrNull(loan.currencyCode),
    dueDate: toDate(loan.dueDate) ?? undefined,
    installmentPeriodicity: toStringOrNull(loan.installmentPeriodicity),
    status: toStringOrNull(loan.status),
    providerUpdatedAt: toDate(loan.updatedAt) ?? undefined,
  }
  await prisma.pluggyLoanRecord.upsert({
    where: { externalId },
    update: loanData,
    create: {
      externalId,
      ...loanData,
      providerCreatedAt: toDate(loan.createdAt) ?? undefined,
    },
  })
  inserted += 1

  return inserted
}

/**
 * Resolve merchants a partir de uma lista de CNPJs. O `GET /merchants` aceita
 * vários por chamada, então lotes de 100 substituem uma requisição por CNPJ.
 * Só consulta os que ainda não estão no banco (o dado cadastral é estável).
 */
async function syncMerchantEntities(cnpjs: string[]) {
  if (cnpjs.length === 0) return 0

  const known = await prisma.pluggyMerchantRecord.findMany({
    where: { cnpj: { in: cnpjs } },
    select: { cnpj: true },
  })
  const knownSet = new Set(known.map((record) => record.cnpj))
  const missing = cnpjs.filter((cnpj) => !knownSet.has(cnpj))

  let inserted = 0

  for (let index = 0; index < missing.length; index += maxMerchantCnpjsPerRequest) {
    const batch = missing.slice(index, index + maxMerchantCnpjsPerRequest)
    const response = await fetchMerchantsByCnpjList(batch)
    const merchants = Array.isArray(response?.foundMerchants)
      ? response.foundMerchants
      : []

    for (const merchant of merchants) {
      const merchantCnpj = toStringOrNull(merchant?.cnpj)
      if (!merchantCnpj) continue

      inserted += await savePayloadSnapshot({
        resourceType: "merchant",
        externalId: merchantCnpj,
        payload: merchant,
        parentExternalId: merchantCnpj,
      })

      const merchantData = {
        externalId: toStringOrNull(merchant?.id),
        name: toStringOrNull(merchant?.name),
        businessName: toStringOrNull(merchant?.businessName),
        category: toStringOrNull(merchant?.category),
        cnae: toStringOrNull(merchant?.cnae),
      }
      await prisma.pluggyMerchantRecord.upsert({
        where: { cnpj: merchantCnpj },
        update: merchantData,
        create: { cnpj: merchantCnpj, ...merchantData },
      })
      inserted += 1
    }
  }

  return inserted
}

/**
 * MeuPluggy (conector 200) é um proxy: o `PATCH /items/{id}` responde
 * "MeuPluggy item cant be updated". A informação chega de duas formas — pelo
 * `connectorId` gravado ou pelo `syncError` de uma tentativa anterior.
 */
async function isRefreshUnsupported(itemId: string) {
  const item = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: itemId },
    select: { connectorId: true, syncError: true },
  })
  if (!item) return false
  if (item.connectorId === MEU_PLUGGY_CONNECTOR_ID) return true
  return Boolean(item.syncError?.includes("cant be updated"))
}

const MEU_PLUGGY_CONNECTOR_ID = 200

export async function syncPluggyData(options: SyncOptions = {}) {
  const resources = options.resources?.length
    ? options.resources
    : defaultResources
  const pageSize = options.pageSize && options.pageSize > 0 ? options.pageSize : 200
  const counters = createEmptyCounters()
  const before = await getPluggyPersistenceSummary()

  // `syncLookbackDays` do UserSetting só era exibido na tela — agora define de
  // fato a janela de contas sem checkpoint.
  const lookbackDays =
    options.lookbackDays ??
    (await prisma.userSetting.findFirst({ select: { syncLookbackDays: true } }))
      ?.syncLookbackDays ??
    30

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
      // Refresh de verdade: pede à instituição uma nova sincronização e
      // aguarda terminar antes de reler. Sem isso o sync só lia dados antigos.
      // Items via MeuPluggy não aceitam PATCH ("MeuPluggy item cant be
      // updated") — para eles o dado fresco vem do auto-sync da Pluggy, então
      // tentar o refresh só gastaria requisição e sujaria `syncError`.
      if (options.refresh && !(await isRefreshUnsupported(itemId))) {
        const { triggerAndPollItem } = await import("@/lib/pluggy-item-refresh")
        await triggerAndPollItem(itemId).catch((error) => {
          console.warn(
            `[Pluggy] refresh do item ${itemId} falhou: ${error instanceof Error ? error.message : error}`,
          )
        })
      }

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
          const transactionResult = await syncAccountTransactions({
            itemId,
            accountId,
            accountCurrencyCode: toStringOrNull(
              (account as Record<string, unknown>).currencyCode,
            ),
            full: options.full,
            lookbackDays,
          })

          counters.transactions += transactionResult.inserted

          for (const cnpj of transactionResult.merchantCnpjs) {
            merchantCnpjs.add(cnpj)
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
      counters.merchants += await syncMerchantEntities([...merchantCnpjs])
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
