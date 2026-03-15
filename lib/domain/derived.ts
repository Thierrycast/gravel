import {
  DomainTransactionDirection,
  Prisma,
} from "@prisma/client"

import { parseNumberParam } from "@/lib/core/filters"
import {
  getCashFlowMetrics,
  getCryptoPortfolioMetrics,
  getOverviewMetrics,
} from "@/lib/domain/analytics"
import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)
const MS_IN_DAY = 24 * 60 * 60 * 1000

type DecimalLike = Prisma.Decimal | null | undefined

type RecurringRuleOrigin = "detected" | "manual"

type RecurringMetadata = {
  origin?: RecurringRuleOrigin
  confidence?: number
  nextDate?: string
  accountId?: string | null
  occurrences?: number
  lastOccurrenceAt?: string | null
  direction?: string | null
  sourceTransactionIds?: string[]
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

function parseMetadata(value?: string | null): RecurringMetadata {
  if (!value) return {}
  try {
    return JSON.parse(value) as RecurringMetadata
  } catch {
    return {}
  }
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  const originalDay = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(originalDay, lastDay))
  return result
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function normalizeText(value?: string | null) {
  return value
    ?.normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() ?? null
}

function safeNumber(value: Prisma.Decimal) {
  return Number(value.toString())
}

function parseOccurrenceDate(ruleDate?: string) {
  if (!ruleDate) return null
  const parsed = new Date(ruleDate)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function occurrenceForMonth(nextDate: Date, monthStart: Date) {
  const monthDelta =
    (monthStart.getUTCFullYear() - nextDate.getUTCFullYear()) * 12 +
    (monthStart.getUTCMonth() - nextDate.getUTCMonth())
  if (monthDelta < 0) return null
  return addMonths(nextDate, monthDelta)
}

function isLoanActive(status?: string | null) {
  const normalized = status?.trim().toUpperCase()
  return !normalized || !["PAID", "SETTLED", "CLOSED", "CANCELLED"].includes(normalized)
}

export async function refreshRecurringDerived(options?: {
  lookbackDays?: number
  minOccurrences?: number
}) {
  const lookbackDays = options?.lookbackDays ?? 365
  const minOccurrences = options?.minOccurrences ?? 3
  const lookbackFrom = new Date(Date.now() - lookbackDays * MS_IN_DAY)

  const [transactions, categories, existingRules] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        occurredAt: { gte: lookbackFrom },
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.domainCategory.findMany(),
    prisma.domainRecurringRule.findMany(),
  ])

  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const groups = new Map<string, typeof transactions>()

  for (const transaction of transactions) {
    const category = transaction.domainCategoryId
      ? categoryMap.get(transaction.domainCategoryId)
      : null

    if (category?.kind === "TRANSFER") continue

    const normalizedDescription =
      transaction.normalizedDescription ?? normalizeText(transaction.description)
    const candidateKey =
      transaction.domainMerchantId ??
      normalizedDescription ??
      transaction.merchantName ??
      transaction.description

    if (!candidateKey) continue

    const key = [
      transaction.direction,
      transaction.domainMerchantId ?? candidateKey,
      transaction.domainAccountId ?? "all",
    ].join(":" )

    const current = groups.get(key) ?? []
    current.push(transaction)
    groups.set(key, current)
  }

  const detectedCandidates = [] as Array<{
    name: string
    merchantId?: string
    categoryId?: string
    descriptionPattern?: string
    amount: Prisma.Decimal
    interval: string
    nextDate: Date
    type: "INCOME" | "EXPENSE"
    accountId?: string | null
    confidence: number
    occurrences: number
    lastOccurrenceAt: Date
    sourceTransactionIds: string[]
  }>

  for (const group of groups.values()) {
    if (group.length < minOccurrences) continue

    const sorted = [...group].sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()
    )
    const intervals = sorted.slice(1).map((current, index) => {
      const previous = sorted[index]
      return (current.occurredAt.getTime() - previous.occurredAt.getTime()) / MS_IN_DAY
    })

    const avgIntervalDays =
      intervals.reduce((total, current) => total + current, 0) /
      Math.max(intervals.length, 1)

    if (avgIntervalDays < 25 || avgIntervalDays > 35) continue

    const amounts = sorted.map((transaction) => Math.abs(safeNumber(transaction.amount)))
    const avgAmountNumber =
      amounts.reduce((total, current) => total + current, 0) / amounts.length
    const maxDeviation = Math.max(
      ...amounts.map((amount) => Math.abs(amount - avgAmountNumber))
    )

    if (maxDeviation > Math.max(20, avgAmountNumber * 0.15)) continue

    const lastTransaction = sorted.at(-1)
    if (!lastTransaction) continue

    const confidence = Math.min(
      0.99,
      0.55 + Math.min(sorted.length, 6) * 0.06 + (1 - maxDeviation / Math.max(avgAmountNumber, 1)) * 0.1
    )

    detectedCandidates.push({
      name:
        lastTransaction.merchantName ??
        lastTransaction.description ??
        "Recorrencia detectada",
      merchantId: lastTransaction.domainMerchantId ?? undefined,
      categoryId: lastTransaction.domainCategoryId ?? undefined,
      descriptionPattern:
        lastTransaction.normalizedDescription ??
        normalizeText(lastTransaction.description) ??
        undefined,
      amount: new Prisma.Decimal(avgAmountNumber.toFixed(2)),
      interval: "MONTHLY",
      nextDate: addMonths(lastTransaction.occurredAt, 1),
      type:
        lastTransaction.direction === DomainTransactionDirection.INFLOW
          ? "INCOME"
          : "EXPENSE",
      accountId: lastTransaction.domainAccountId,
      confidence,
      occurrences: sorted.length,
      lastOccurrenceAt: lastTransaction.occurredAt,
      sourceTransactionIds: sorted.slice(-6).map((item) => item.id),
    })
  }

  const autoDetectedIds = existingRules
    .filter((rule) => parseMetadata(rule.metadataJson).origin === "detected")
    .map((rule) => rule.id)

  if (autoDetectedIds.length > 0) {
    await prisma.domainRecurringRule.deleteMany({
      where: { id: { in: autoDetectedIds } },
    })
  }

  for (const candidate of detectedCandidates) {
    await prisma.domainRecurringRule.create({
      data: {
        name: candidate.name,
        merchantId: candidate.merchantId,
        categoryId: candidate.categoryId,
        descriptionPattern: candidate.descriptionPattern,
        amount: candidate.amount,
        interval: candidate.interval,
        active: true,
        metadataJson: JSON.stringify({
          origin: "detected",
          confidence: candidate.confidence,
          nextDate: candidate.nextDate.toISOString(),
          accountId: candidate.accountId,
          occurrences: candidate.occurrences,
          lastOccurrenceAt: candidate.lastOccurrenceAt.toISOString(),
          direction: candidate.type,
          sourceTransactionIds: candidate.sourceTransactionIds,
        } satisfies RecurringMetadata),
      },
    })
  }

  return {
    lookbackDays,
    minOccurrences,
    detected: detectedCandidates.length,
    preservedManual: existingRules.length - autoDetectedIds.length,
  }
}

export async function getRecurringPayload(type?: "INCOME" | "EXPENSE") {
  const rules = await prisma.domainRecurringRule.findMany({
    where: {
      active: true,
      metadataJson: type
        ? {
            contains: `"direction":"${type}"`,
          }
        : undefined,
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  })

  return rules
    .map((rule) => {
      const metadata = parseMetadata(rule.metadataJson)
      const nextDate = parseOccurrenceDate(metadata.nextDate) ?? addMonths(new Date(), 1)
      const recurringType =
        metadata.direction === "INCOME" || metadata.direction === "EXPENSE"
          ? metadata.direction
          : "EXPENSE"

      return {
        id: rule.id,
        title: rule.name,
        type: recurringType,
        amount: rule.amount,
        interval: rule.interval ?? "MONTHLY",
        nextDate,
        active: rule.active,
        accountId: metadata.accountId ?? null,
        merchantId: rule.merchantId,
        categoryId: rule.categoryId,
        confidence: metadata.confidence ?? null,
        origin: metadata.origin ?? "manual",
        occurrences: metadata.occurrences ?? null,
        lastOccurrenceAt: metadata.lastOccurrenceAt
          ? new Date(metadata.lastOccurrenceAt)
          : null,
      }
    })
    .filter((rule) => (type ? rule.type === type : true))
    .sort((left, right) => left.nextDate.getTime() - right.nextDate.getTime())
}

export async function getProjectionPayload(searchParams?: URLSearchParams) {
  const months = Math.min(
    Math.max(parseNumberParam(searchParams?.get("months") ?? null, 6) ?? 6, 1),
    24
  )
  const [overview, recurringRules, bills] = await Promise.all([
    getOverviewMetrics(new URLSearchParams("period=all")),
    getRecurringPayload(),
    prisma.domainBill.findMany({
      where: {
        dueDate: {
          gte: new Date(),
        },
      },
      orderBy: [{ dueDate: "asc" }],
    }),
  ])

  const now = new Date()
  let projectedBalance = overview.accountBalance
  const points = [] as Array<{
    date: Date
    projectedBalance: Prisma.Decimal
    inflow: Prisma.Decimal
    outflow: Prisma.Decimal
    recurringInflow: Prisma.Decimal
    recurringOutflow: Prisma.Decimal
    billsOutflow: Prisma.Decimal
  }>

  for (let index = 1; index <= months; index += 1) {
    const pointDate = startOfMonth(addMonths(now, index))
    const pointMonthEnd = endOfMonth(pointDate)

    let recurringInflow = ZERO
    let recurringOutflow = ZERO

    for (const rule of recurringRules) {
      if (!rule.active) continue
      const nextDate = rule.nextDate
      const occurrenceDate = occurrenceForMonth(nextDate, pointDate)
      if (!occurrenceDate) continue
      if (occurrenceDate < pointDate || occurrenceDate > pointMonthEnd) continue

      if (rule.type === "INCOME") {
        recurringInflow = recurringInflow.plus(decimal(rule.amount))
      } else {
        recurringOutflow = recurringOutflow.plus(decimal(rule.amount))
      }
    }

    const billsOutflow = sumDecimals(
      bills
        .filter((bill) => bill.dueDate && bill.dueDate >= pointDate && bill.dueDate <= pointMonthEnd)
        .map((bill) => bill.totalAmount)
    )

    const inflow = recurringInflow
    const outflow = recurringOutflow.plus(billsOutflow)
    projectedBalance = projectedBalance.plus(inflow).minus(outflow)

    points.push({
      date: pointDate,
      projectedBalance,
      inflow,
      outflow,
      recurringInflow,
      recurringOutflow,
      billsOutflow,
    })
  }

  return {
    summary: {
      startBalance: overview.accountBalance,
      projectedFinalBalance: points.at(-1)?.projectedBalance ?? overview.accountBalance,
      months,
    },
    points,
  }
}

export async function getPortfolioPayload() {
  const [overview, accounts, investments, crypto, loans, recurring, history] = await Promise.all([
    getOverviewMetrics(new URLSearchParams("period=all")),
    prisma.domainAccount.findMany({ orderBy: [{ kind: "asc" }, { balance: "desc" }] }),
    prisma.domainInvestment.findMany({ orderBy: [{ balance: "desc" }, { name: "asc" }] }),
    getCryptoPortfolioMetrics(new URLSearchParams("period=all")),
    prisma.pluggyLoanRecord.findMany({ orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }),
    getRecurringPayload(),
    buildPortfolioHistory(12),
  ])

  const activeLoans = loans.filter((loan) => isLoanActive(loan.status))
  const loanBalance = sumDecimals(activeLoans.map((loan) => loan.contractAmount))
  const liabilitiesTotal = overview.openBills.plus(loanBalance)

  return {
    summary: {
      liquidAssets: overview.accountBalance,
      investments: overview.investmentsTotal,
      crypto: overview.cryptoTotal,
      openBills: overview.openBills,
      loans: loanBalance,
      liabilitiesTotal,
      grossAssets: overview.accountBalance.plus(overview.investmentsTotal).plus(overview.cryptoTotal),
      netWorth: overview.accountBalance
        .plus(overview.investmentsTotal)
        .plus(overview.cryptoTotal)
        .minus(liabilitiesTotal),
      recurringIncome: sumDecimals(
        recurring.filter((rule) => rule.type === "INCOME").map((rule) => rule.amount)
      ),
      recurringExpense: sumDecimals(
        recurring.filter((rule) => rule.type === "EXPENSE").map((rule) => rule.amount)
      ),
    },
    accounts,
    investments,
    crypto,
    loans: activeLoans,
    recurring,
    history,
  }
}

export async function buildPortfolioHistory(months = 12) {
  const now = new Date()
  const { netWorth } = await getOverviewMetrics(new URLSearchParams("period=all"))
  const cashFlow = await getCashFlowMetrics(
    new URLSearchParams(`period=${months}m&groupBy=month`)
  )

  const bucketMap = new Map(cashFlow.map((point) => [point.period, point.net]))
  const monthsList = [] as Date[]
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    monthsList.push(startOfMonth(addMonths(now, -offset)))
  }

  const points = monthsList.map((date) => {
    const futureMonths = monthsList.filter((current) => current > date)
    const rollback = sumDecimals(
      futureMonths.map((month) => bucketMap.get(monthKey(month)))
    )

    return {
      date,
      netWorth: netWorth.minus(rollback),
      source: "derived",
    }
  })

  return points
}

export async function refreshDerivedCaches() {
  const recurringSummary = await refreshRecurringDerived()
  const [portfolioHistory, projection] = await Promise.all([
    buildPortfolioHistory(12),
    getProjectionPayload(new URLSearchParams("months=6")),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.portfolioSnapshot.deleteMany()
    if (portfolioHistory.length > 0) {
      await tx.portfolioSnapshot.createMany({
        data: portfolioHistory.map((point) => ({
          date: point.date,
          netWorth: point.netWorth,
        })),
      })
    }

    await tx.balanceProjection.deleteMany()
    if (projection.points.length > 0) {
      await tx.balanceProjection.createMany({
        data: projection.points.map((point) => ({
          date: point.date,
          projectedBalance: point.projectedBalance,
        })),
      })
    }
  })

  return {
    recurring: recurringSummary,
    portfolioSnapshots: portfolioHistory.length,
    projections: projection.points.length,
  }
}
