import { randomUUID } from "node:crypto"

import { DomainCategoryKind, DomainTransactionDirection, Prisma } from "@prisma/client"

import { normalizeFinancialText, normalizeMerchantName } from "@/lib/domain/enrichment/normalization"
import { prisma } from "@/lib/prisma"

const explicitInstallmentPattern =
  /(?:^|\D)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})(?:\D|$)/i
const maxSimilarityInferredInstallments = 2
const maxExplicitInstallmentAmountVariance = new Prisma.Decimal("1")

type InstallmentCandidate = {
  id: string
  occurredAt: Date
  description?: string | null
  normalizedDescription?: string | null
  amount: Prisma.Decimal
  direction: DomainTransactionDirection | string
  domainAccountId?: string | null
  domainCategoryId?: string | null
  domainMerchantId?: string | null
  merchantName?: string | null
  metadataJson?: string | null
}

/**
 * Data completa (dd/mm/aaaa ou dd/mm/aa). Nunca é marcador de parcela.
 */
const fullDatePattern = /\b\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{2,4}\b/

/**
 * Palavra que declara parcelamento. Quando aparece, o marcador é parcela e
 * pronto — nenhuma outra pista precisa ser consultada.
 */
const installmentKeywordPattern = /\b(parc|parcs|parcela|parcelas|parcelado|presta[çc][ãa]o|presta[çc][õo]es)\b/i

/**
 * Rótulo de data logo antes do marcador. Em extrato brasileiro, "em 01/12" e
 * "dia 02/10" são data; "01/12" sozinho, num cartão, é parcela.
 */
const dateLeadInPattern = /\b(em|no dia|dia|data|venc|vencimento|vcto|ref)\s*$/i

/**
 * Lê `N/T` (ou `N de T`) como parcela — sem cair em data.
 *
 * O padrão sozinho casa com data: "Uber em 01/12" virava parcela 1 de 12, e o
 * motor projetava doze Ubers que nunca vão existir. Dá para separar os dois
 * casos porque o extrato dá pistas:
 *
 * - `01/12/2026` é data completa, nunca parcela;
 * - `em 01/12`, `dia 2/10`, `venc 05/11` — rótulo de data antes do número;
 * - `parc 01/12`, `3 parcelas` — palavra de parcelamento, que decide a favor
 *   de parcela mesmo se houver rótulo de data na frase.
 *
 * O que sobra — `N/T` cru, sem rótulo nenhum — continua sendo lido como
 * parcela, porque num extrato de cartão é isso que ele é na esmagadora maioria
 * das vezes. Não há como zerar a ambiguidade de "2/10" sem contexto; dá para
 * parar de errar nos casos em que o contexto existe.
 */
export function detectExplicitInstallment(text?: string | null) {
  if (!text) return null

  const match = text.match(explicitInstallmentPattern)
  if (!match) return null

  const current = Number.parseInt(match[1] ?? "", 10)
  const total = Number.parseInt(match[2] ?? "", 10)
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null
  if (current < 1 || total < 2 || current > total) return null

  const declaresInstallment = installmentKeywordPattern.test(text)

  if (!declaresInstallment) {
    if (fullDatePattern.test(text)) return null

    // Tudo que vem antes do primeiro dígito do marcador. `match.index` aponta
    // para o caractere não-numérico que o padrão consome à esquerda, então o
    // corte é no dígito, não no início do match.
    const digitOffset = match[0].search(/\d/)
    const before = text.slice(0, (match.index ?? 0) + Math.max(digitOffset, 0))
    if (dateLeadInPattern.test(before)) return null
  }

  return { current, total }
}

export function stripInstallmentMarker(text?: string | null) {
  return normalizeFinancialText(text)?.replace(explicitInstallmentPattern, " ").replace(/\s+/g, " ").trim() ?? null
}

export function installmentMerchantKey(transaction: InstallmentCandidate) {
  return (
    transaction.domainMerchantId ??
    normalizeMerchantName(transaction.merchantName) ??
    stripInstallmentMarker(transaction.description) ??
    "unknown"
  )
}

export function installmentDescriptionKey(transaction: InstallmentCandidate) {
  const descriptionKey = stripInstallmentMarker(transaction.description)
  if (detectExplicitInstallment(transaction.description) && descriptionKey) {
    return descriptionKey
  }

  return (
    stripInstallmentMarker(transaction.normalizedDescription) ??
    descriptionKey ??
    installmentMerchantKey(transaction)
  )
}

function amountKey(amount: Prisma.Decimal) {
  return amount.abs().toFixed(2)
}

function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function groupKey(transaction: InstallmentCandidate, options?: { includeCategory?: boolean; includeAmount?: boolean }) {
  return [
    installmentMerchantKey(transaction),
    installmentDescriptionKey(transaction),
    transaction.domainAccountId ?? "all",
    options?.includeCategory === false ? "any-category" : transaction.domainCategoryId ?? "uncategorized",
    options?.includeAmount === false ? "any-amount" : amountKey(transaction.amount),
  ].join(":")
}

function isConsecutiveMonths(transactions: InstallmentCandidate[]) {
  const sorted = [...transactions].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
  return sorted.every((transaction, index) => {
    if (index === 0) return true
    return monthIndex(transaction.occurredAt) - monthIndex(sorted[index - 1].occurredAt) === 1
  })
}

function isAmountClose(left: Prisma.Decimal, right: Prisma.Decimal) {
  return left.abs().minus(right.abs()).abs().lessThanOrEqualTo(maxExplicitInstallmentAmountVariance)
}

/**
 * Janela em que duas ocorrências do mesmo índice de parcela são consideradas a
 * mesma parcela repassada duas vezes, e não dois parcelamentos distintos que
 * por acaso têm o mesmo marcador. Um mês de folga cobre a consolidação do
 * banco sem engolir uma compra nova meses depois.
 */
const duplicateInstallmentWindowDays = 31

function isWithinDuplicateWindow(previous: Date, current: Date) {
  const deltaDays = Math.abs(current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000)
  return deltaDays <= duplicateInstallmentWindowDays
}

function splitExplicitInstallmentGroup(transactions: InstallmentCandidate[]) {
  const sorted = [...transactions].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
  const groups: InstallmentCandidate[][] = []

  for (const transaction of sorted) {
    const explicit = detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)
    if (!explicit) continue

    const currentGroup = groups.at(-1)
    const previousTransaction = currentGroup?.at(-1)
    const previousExplicit = previousTransaction
      ? detectExplicitInstallment(previousTransaction.description ?? previousTransaction.normalizedDescription)
      : null
    const referenceTransaction = currentGroup?.[0]
    const amountMatches =
      !referenceTransaction || isAmountClose(transaction.amount, referenceTransaction.amount)

    // Repasse duplicado da MESMA parcela. Acontece em consolidação de alguns
    // bancos: o mesmo "3/10" chega duas vezes na mesma janela. Antes isso
    // reprovava o teste `current > anterior`, abria uma cadeia nova e o
    // lançamento passava a ser projetado em dobro até o fim do parcelamento.
    // Descartar a repetição é mais seguro do que duplicar a série.
    const isDuplicateOfPrevious =
      Boolean(previousExplicit) &&
      Boolean(previousTransaction) &&
      explicit.total === previousExplicit?.total &&
      explicit.current === previousExplicit?.current &&
      amountMatches &&
      isWithinDuplicateWindow(previousTransaction!.occurredAt, transaction.occurredAt)

    if (isDuplicateOfPrevious) continue

    const continuesCurrentGroup =
      Boolean(currentGroup) &&
      Boolean(previousExplicit) &&
      explicit.total === previousExplicit?.total &&
      explicit.current > (previousExplicit?.current ?? 0) &&
      amountMatches

    if (continuesCurrentGroup && currentGroup) {
      currentGroup.push(transaction)
    } else {
      groups.push([transaction])
    }
  }

  return groups
}

export function inferInstallmentGroups(transactions: InstallmentCandidate[]) {
  const candidates = transactions.filter(
    (transaction) => transaction.direction === DomainTransactionDirection.OUTFLOW || transaction.direction === "OUTFLOW"
  )
  const explicitGroups = new Map<string, InstallmentCandidate[]>()
  const similarGroups = new Map<string, InstallmentCandidate[]>()

  for (const transaction of candidates) {
    const explicit = detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)
    const key = groupKey(transaction, { includeCategory: !explicit, includeAmount: !explicit })
    const target = explicit ? explicitGroups : similarGroups
    target.set(key, [...(target.get(key) ?? []), transaction])
  }

  const groups: Array<{
    transactions: InstallmentCandidate[]
    totalInstallments: number
    confidence: Prisma.Decimal
    source: string
  }> = []

  for (const groupedTransactions of explicitGroups.values()) {
    for (const sorted of splitExplicitInstallmentGroup(groupedTransactions)) {
      const totals = sorted
        .map((transaction) => detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)?.total)
        .filter((value): value is number => Boolean(value))
      const totalInstallments = Math.max(...totals, sorted.length)
      groups.push({
        transactions: sorted,
        totalInstallments,
        confidence: new Prisma.Decimal("0.95"),
        source: "explicit",
      })
    }
  }

  for (const group of similarGroups.values()) {
    if (group.length < 2) continue
    if (group.length > maxSimilarityInferredInstallments) continue
    if (!isConsecutiveMonths(group)) continue

    const sorted = [...group].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
    groups.push({
      transactions: sorted,
      totalInstallments: sorted.length,
      confidence: new Prisma.Decimal("0.7"),
      source: "similarity",
    })
  }

  return groups
}

function hasManualCategoryOverride(transaction: InstallmentCandidate) {
  if (!transaction.metadataJson) return false

  try {
    const metadata = JSON.parse(transaction.metadataJson) as {
      overrides?: { categoryId?: string | null }
    }
    return Boolean(metadata.overrides && "categoryId" in metadata.overrides)
  } catch {
    return false
  }
}

export function selectCanonicalInstallmentCategoryId(
  transactions: InstallmentCandidate[],
  categoryKindById = new Map<string, DomainCategoryKind>(),
) {
  const candidates = new Map<
    string,
    { count: number; firstIndex: number; kind?: DomainCategoryKind }
  >()

  for (const [index, transaction] of transactions.entries()) {
    if (!transaction.domainCategoryId) continue
    const current = candidates.get(transaction.domainCategoryId)
    if (current) {
      current.count += 1
      continue
    }
    candidates.set(transaction.domainCategoryId, {
      count: 1,
      firstIndex: index,
      kind: categoryKindById.get(transaction.domainCategoryId),
    })
  }

  const entries = Array.from(candidates.entries())
  if (entries.length === 0) return null

  const nonTransferEntries = entries.filter(([, candidate]) => candidate.kind !== DomainCategoryKind.TRANSFER)
  const pool = nonTransferEntries.length > 0 ? nonTransferEntries : entries

  pool.sort((left, right) => {
    const byCount = right[1].count - left[1].count
    if (byCount !== 0) return byCount
    return left[1].firstIndex - right[1].firstIndex
  })

  return pool[0]?.[0] ?? null
}

export async function rebuildInstallmentGroups() {
  const [transactions, categories] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        direction: DomainTransactionDirection.OUTFLOW,
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.domainCategory.findMany({
      select: { id: true, kind: true },
    }),
  ])
  const groups = inferInstallmentGroups(transactions)
  const categoryKindById = new Map(categories.map((category) => [category.id, category.kind]))

  // O rebuild é uma transação em lote: os N updates viajam num único round-trip.
  // No modo interativo (`async (tx) => {}`) cada `await` era uma ida ao banco e
  // lotes grandes estouravam o timeout padrão de 5s, derrubando o sync com P2028.
  const groupRows: Prisma.TransactionInstallmentGroupCreateManyInput[] = []
  const transactionUpdates: {
    id: string
    data: Prisma.DomainTransactionUncheckedUpdateInput
  }[] = []

  for (const group of groups) {
    const first = group.transactions[0]
    const last = group.transactions.at(-1)
    if (!first || !last) continue
    const canonicalCategoryId = selectCanonicalInstallmentCategoryId(
      group.transactions,
      categoryKindById,
    )

    const groupId = randomUUID()
    groupRows.push({
      id: groupId,
      merchantKey: installmentMerchantKey(first),
      descriptionKey: installmentDescriptionKey(first),
      accountId: first.domainAccountId ?? null,
      categoryId: canonicalCategoryId,
      amount: first.amount.abs(),
      totalInstallments: group.totalInstallments,
      firstDate: first.occurredAt,
      lastDate: last.occurredAt,
      confidence: group.confidence,
      source: group.source,
    })

    for (const [index, transaction] of group.transactions.entries()) {
      const explicit = detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)
      transactionUpdates.push({
        id: transaction.id,
        data: {
          installmentGroupId: groupId,
          installmentNumber: explicit?.current ?? index + 1,
          installmentTotal: explicit?.total ?? group.totalInstallments,
          ...(canonicalCategoryId && !hasManualCategoryOverride(transaction)
            ? { domainCategoryId: canonicalCategoryId }
            : {}),
        },
      })
    }
  }

  await prisma.$transaction([
    prisma.domainTransaction.updateMany({
      data: {
        installmentGroupId: null,
        installmentNumber: null,
        installmentTotal: null,
      },
    }),
    prisma.transactionInstallmentGroup.deleteMany(),
    ...(groupRows.length > 0
      ? [prisma.transactionInstallmentGroup.createMany({ data: groupRows })]
      : []),
    ...transactionUpdates.map(({ id, data }) =>
      prisma.domainTransaction.update({ where: { id }, data }),
    ),
  ])

  return { transactions: transactions.length, groups: groups.length }
}
