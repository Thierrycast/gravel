import { DomainTransactionDirection, Prisma } from "@prisma/client"

import { normalizeFinancialText, normalizeMerchantName } from "@/lib/domain/enrichment/normalization"
import { prisma } from "@/lib/prisma"

const explicitInstallmentPattern =
  /(?:^|\D)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})(?:\D|$)/i
const maxSimilarityInferredInstallments = 2

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
}

export function detectExplicitInstallment(text?: string | null) {
  const match = text?.match(explicitInstallmentPattern)
  if (!match) return null

  const current = Number.parseInt(match[1] ?? "", 10)
  const total = Number.parseInt(match[2] ?? "", 10)
  if (!Number.isFinite(current) || !Number.isFinite(total)) return null
  if (current < 1 || total < 2 || current > total) return null

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
  return (
    stripInstallmentMarker(transaction.normalizedDescription) ??
    stripInstallmentMarker(transaction.description) ??
    installmentMerchantKey(transaction)
  )
}

function amountKey(amount: Prisma.Decimal) {
  return amount.abs().toFixed(2)
}

function monthIndex(date: Date) {
  return date.getUTCFullYear() * 12 + date.getUTCMonth()
}

function groupKey(transaction: InstallmentCandidate) {
  return [
    installmentMerchantKey(transaction),
    installmentDescriptionKey(transaction),
    transaction.domainAccountId ?? "all",
    transaction.domainCategoryId ?? "uncategorized",
    amountKey(transaction.amount),
  ].join(":")
}

function isConsecutiveMonths(transactions: InstallmentCandidate[]) {
  const sorted = [...transactions].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
  return sorted.every((transaction, index) => {
    if (index === 0) return true
    return monthIndex(transaction.occurredAt) - monthIndex(sorted[index - 1].occurredAt) === 1
  })
}

export function inferInstallmentGroups(transactions: InstallmentCandidate[]) {
  const candidates = transactions.filter(
    (transaction) => transaction.direction === DomainTransactionDirection.OUTFLOW || transaction.direction === "OUTFLOW"
  )
  const explicitGroups = new Map<string, InstallmentCandidate[]>()
  const similarGroups = new Map<string, InstallmentCandidate[]>()

  for (const transaction of candidates) {
    const explicit = detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)
    const key = groupKey(transaction)
    const target = explicit ? explicitGroups : similarGroups
    target.set(key, [...(target.get(key) ?? []), transaction])
  }

  const groups: Array<{
    transactions: InstallmentCandidate[]
    totalInstallments: number
    confidence: Prisma.Decimal
    source: string
  }> = []

  for (const group of explicitGroups.values()) {
    const sorted = [...group].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
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

export async function rebuildInstallmentGroups() {
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      direction: DomainTransactionDirection.OUTFLOW,
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  })
  const groups = inferInstallmentGroups(transactions)

  await prisma.$transaction(async (tx) => {
    await tx.domainTransaction.updateMany({
      data: {
        installmentGroupId: null,
        installmentNumber: null,
        installmentTotal: null,
      },
    })
    await tx.transactionInstallmentGroup.deleteMany()

    for (const group of groups) {
      const first = group.transactions[0]
      const last = group.transactions.at(-1)
      if (!first || !last) continue

      const createdGroup = await tx.transactionInstallmentGroup.create({
        data: {
          merchantKey: installmentMerchantKey(first),
          descriptionKey: installmentDescriptionKey(first),
          accountId: first.domainAccountId ?? null,
          categoryId: first.domainCategoryId ?? null,
          amount: first.amount.abs(),
          totalInstallments: group.totalInstallments,
          firstDate: first.occurredAt,
          lastDate: last.occurredAt,
          confidence: group.confidence,
          source: group.source,
        },
      })

      for (const [index, transaction] of group.transactions.entries()) {
        const explicit = detectExplicitInstallment(transaction.description ?? transaction.normalizedDescription)
        await tx.domainTransaction.update({
          where: { id: transaction.id },
          data: {
            installmentGroupId: createdGroup.id,
            installmentNumber: explicit?.current ?? index + 1,
            installmentTotal: explicit?.total ?? group.totalInstallments,
          },
        })
      }
    }
  })

  return { transactions: transactions.length, groups: groups.length }
}
