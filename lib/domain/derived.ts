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

  const categoryMap = new Map<string, typeof categories[number]>(categories.map((category) => [category.id, category]))
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

    let detectedInterval: string | null = null
    if (avgIntervalDays >= 5 && avgIntervalDays <= 9) detectedInterval = "WEEKLY"
    else if (avgIntervalDays >= 12 && avgIntervalDays <= 16) detectedInterval = "BIWEEKLY"
    else if (avgIntervalDays >= 25 && avgIntervalDays <= 35) detectedInterval = "MONTHLY"
    else if (avgIntervalDays >= 80 && avgIntervalDays <= 100) detectedInterval = "QUARTERLY"
    else if (avgIntervalDays >= 345 && avgIntervalDays <= 385) detectedInterval = "YEARLY"

    if (!detectedInterval) continue

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

    let nextDate = new Date(lastTransaction.occurredAt)
    if (detectedInterval === "WEEKLY") nextDate.setUTCDate(nextDate.getUTCDate() + 7)
    else if (detectedInterval === "BIWEEKLY") nextDate.setUTCDate(nextDate.getUTCDate() + 14)
    else if (detectedInterval === "MONTHLY") nextDate = addMonths(nextDate, 1)
    else if (detectedInterval === "QUARTERLY") nextDate = addMonths(nextDate, 3)
    else if (detectedInterval === "YEARLY") nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1)

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
      interval: detectedInterval,
      nextDate: nextDate,
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
        descriptionPattern: rule.descriptionPattern,
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
  const horizonMonths = Math.min(
    Math.max(parseNumberParam(searchParams?.get("months") ?? null, 6) ?? 6, 1),
    24
  )

  const now = new Date()
  const lookbackFrom = new Date(now.getTime() - 90 * MS_IN_DAY)

  const [overview, recurringRules, bills, pastTransactions, categories] = await Promise.all([
    getOverviewMetrics(new URLSearchParams("period=all")),
    getRecurringPayload(),
    prisma.domainBill.findMany({
      where: {
        dueDate: {
          gte: now,
        },
      },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        direction: DomainTransactionDirection.OUTFLOW,
        occurredAt: { gte: lookbackFrom },
      },
    }),
    prisma.domainCategory.findMany(),
  ])

  // Variable (non-recurring) expenses: exclude internal transfers and known recurring rules
  const categoryMap = new Map<string, typeof categories[number]>(categories.map((c) => [c.id, c]))
  const EXCLUDED_SPENDING_CATEGORIES = new Set([
    "pagamento de cartão de crédito",
    "transferência mesma titularidade",
    "transferência entre contas",
    "pagamento de fatura",
  ])

  const variableTransactions = pastTransactions.filter((tx) => {
    const cat = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null
    if (cat?.kind === "TRANSFER") return false
    if (cat?.name && EXCLUDED_SPENDING_CATEGORIES.has(cat.name.toLowerCase())) return false

    const isRecurring = recurringRules.some((rule) => {
      if (rule.type === "INCOME") return false
      if (rule.merchantId && rule.merchantId === tx.domainMerchantId) return true
      if (rule.descriptionPattern) {
        const normalized = tx.normalizedDescription ?? normalizeText(tx.description)
        if (normalized?.includes(rule.descriptionPattern.toLowerCase())) return true
      }
      return false
    })

    return !isRecurring
  })

  const totalVariableOutflow = sumDecimals(variableTransactions.map((tx) => tx.amount.abs()))
  const avgVariableExpenses = safeNumber(totalVariableOutflow.div(3)) // 3-month average

  let currentBalance = overview.accountBalance
  const monthsData = [] as Array<{
    month: number
    year: number
    label: string
    income: number
    recurringExpenses: number
    installments: number
    variableExpenses: number
    projected: number
    balance: number
  }>

  for (let index = 1; index <= horizonMonths; index += 1) {
    const pointDate = startOfMonth(addMonths(now, index))
    const pointMonthEnd = endOfMonth(pointDate)

    let recurringInflow = ZERO
    let recurringOutflow = ZERO
    let installmentsOutflow = ZERO

    // 1. Recurring Rules
    for (const rule of recurringRules) {
      if (!rule.active) continue
      const nextDate = rule.nextDate
      const occurrenceDate = occurrenceForMonth(nextDate, pointDate)
      if (!occurrenceDate) continue
      if (occurrenceDate < pointDate || occurrenceDate > pointMonthEnd) continue

      if (rule.type === "INCOME") {
        recurringInflow = recurringInflow.plus(decimal(rule.amount))
      } else if (rule.origin === "detected" || rule.interval === "MONTHLY") {
        recurringOutflow = recurringOutflow.plus(decimal(rule.amount).abs())
      } else {
        installmentsOutflow = installmentsOutflow.plus(decimal(rule.amount).abs())
      }
    }

    // 2. Bills
    const monthlyBills = bills.filter(
      (bill) => bill.dueDate && bill.dueDate >= pointDate && bill.dueDate <= pointMonthEnd
    )
    const billsOutflow = sumDecimals(monthlyBills.map((bill) => bill.totalAmount)).abs()

    // 3. Smart Installment Detection (from past transactions)
    // Look for transactions that are part of an installment plan (e.g. "Purchase 1/3")
    // If we are in month index=1, and there was a "1/3" in month -1, then month 1 is "3/3".
    const detectedInstallments = pastTransactions.filter((tx) => {
      const match = tx.description?.match(/(\d+)\/(\d+)/)
      if (!match) return false
      const current = parseInt(match[1], 10)
      const total = parseInt(match[2], 10)
      if (current >= total) return false

      // Calculate if this installment should fall into the current projection month
      const txDate = new Date(tx.occurredAt)
      const monthsSinceTx = 
        (pointDate.getUTCFullYear() - txDate.getUTCFullYear()) * 12 + 
        (pointDate.getUTCMonth() - txDate.getUTCMonth())
      
      const projectedInstallmentNumber = current + monthsSinceTx
      return projectedInstallmentNumber <= total
    })
    
    const smartInstallmentsOutflow = sumDecimals(detectedInstallments.map(tx => tx.amount.abs()))

    // 4. Future Transactions (Manual or scheduled)
    const futureTransactions = pastTransactions.filter(tx => 
      tx.occurredAt >= pointDate && tx.occurredAt <= pointMonthEnd
    )
    const futureInflow = sumDecimals(futureTransactions.filter(tx => tx.direction === "INFLOW").map(tx => tx.amount))
    const futureOutflow = sumDecimals(futureTransactions.filter(tx => tx.direction === "OUTFLOW").map(tx => tx.amount.abs()))

    const income = safeNumber(recurringInflow.plus(futureInflow))
    const recurringExpenses = safeNumber(recurringOutflow)
    const installments = safeNumber(installmentsOutflow.plus(billsOutflow).plus(smartInstallmentsOutflow))
    const variableExpenses = avgVariableExpenses
    const knownFutureOutflow = safeNumber(futureOutflow)

    const totalOutflow = recurringExpenses + installments + variableExpenses + knownFutureOutflow
    const monthlyNet = income - totalOutflow
    currentBalance = currentBalance.plus(new Prisma.Decimal(monthlyNet.toFixed(2)))

    monthsData.push({
      month: pointDate.getUTCMonth() + 1,
      year: pointDate.getUTCFullYear(),
      label: monthKey(pointDate),
      income,
      recurringExpenses,
      installments,
      variableExpenses: variableExpenses + knownFutureOutflow,
      projected: monthlyNet,
      balance: safeNumber(currentBalance),
    })
  }

  const averageMonthlyIncome =
    monthsData.reduce((sum, m) => sum + m.income, 0) / monthsData.length
  const averageMonthlyExpenses =
    monthsData.reduce((sum, m) => sum + m.recurringExpenses + m.installments + m.variableExpenses, 0) /
    monthsData.length

  return {
    summary: {
      averageMonthlyIncome,
      averageMonthlyExpenses,
      projectedSavings: safeNumber(currentBalance.minus(overview.accountBalance)),
    },
    months: monthsData,
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
    if (projection.months.length > 0) {
      await tx.balanceProjection.createMany({
        data: projection.months.map((m) => ({
          date: new Date(`${m.year}-${String(m.month).padStart(2, "0")}-01T00:00:00Z`),
          projectedBalance: new Prisma.Decimal(m.balance.toFixed(2)),
        })),
      })
    }
  })

  return {
    recurring: recurringSummary,
    portfolioSnapshots: portfolioHistory.length,
    projections: projection.months.length,
  }
}

export async function getDashboardRecurring() {
  const rules = await getRecurringPayload("EXPENSE")
  const categories = await prisma.domainCategory.findMany()
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  const mapped = rules.map((r) => ({
    id: r.id,
    description: r.title,
    amount: r.amount,
    frequency: r.interval,
    category: r.categoryId ? categoryMap.get(r.categoryId) ?? "Sem categoria" : "Sem categoria",
    categoryId: r.categoryId,
    nextDate: r.nextDate,
    type: r.type,
    occurrences: r.occurrences ?? 0,
    lastDate: r.lastOccurrenceAt,
    confidence: r.confidence ?? 0,
    isManual: r.origin === "manual",
    origin: r.origin,
  }))

  const total = rules.reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0)
  
  return {
    rules: mapped,
    summary: {
      totalMonthly: total,
    }
  }
}
