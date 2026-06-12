import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)

/**
 * Generates a balance anchor for a specific account and month.
 * A balance anchor is the state of the account balance at the END of a given month.
 */
export async function createBalanceAnchor(accountId: string, year: number, month: number) {
  const previousAnchor = await prisma.domainBalanceAnchor.findFirst({
    where: {
      domainAccountId: accountId,
      OR: [
        { year: { lt: year } },
        { year, month: { lt: month } }
      ]
    },
    orderBy: [
      { year: "desc" },
      { month: "desc" }
    ]
  })

  const startBalance = previousAnchor ? previousAnchor.balance : ZERO
  // Derive the window from the requested (year, month), not from the previous anchor.
  // `month` is 1-indexed; Date.UTC expects 0-indexed month, so `month - 1` gives the
  // first day of the requested month, and `month` with day=0 gives its last day.
  const startDate = new Date(Date.UTC(year, month - 1, 1))
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

  // 2. Sum transactions in [startDate, endDate] — inclusive on both ends so
  //    transactions timestamped exactly at 00:00:00.000 on day 1 aren't lost.
  const aggregations = await prisma.domainTransaction.aggregate({
    where: {
      domainAccountId: accountId,
      occurredAt: {
        gte: startDate,
        lte: endDate
      },
      ignored: false
    },
    _sum: {
      amount: true
    },
    _count: true
  })

  const delta = aggregations._sum.amount || ZERO
  const finalBalance = startBalance.plus(delta)

  return await prisma.domainBalanceAnchor.upsert({
    where: {
      domainAccountId_year_month: {
        domainAccountId: accountId,
        year,
        month
      }
    },
    create: {
      domainAccountId: accountId,
      year,
      month,
      balance: finalBalance,
      transactionsCount: aggregations._count
    },
    update: {
      balance: finalBalance,
      transactionsCount: aggregations._count
    }
  })
}

/**
 * Rebuilds all anchors for an account from the first transaction until now.
 * Single pass over the account's transactions aggregated in memory by (year, month),
 * then a single $transaction persists the anchors (N+1 queries → 3).
 */
export async function rebuildAccountAnchors(accountId: string) {
  const transactions = await prisma.domainTransaction.findMany({
    where: { domainAccountId: accountId, ignored: false },
    select: { occurredAt: true, amount: true },
    orderBy: { occurredAt: "asc" },
  })

  if (transactions.length === 0) return

  type MonthlyBucket = { year: number; month: number; delta: Prisma.Decimal; count: number }
  const buckets = new Map<string, MonthlyBucket>()

  for (const tx of transactions) {
    const year = tx.occurredAt.getUTCFullYear()
    const month = tx.occurredAt.getUTCMonth() + 1
    const key = `${year}-${month}`
    const bucket = buckets.get(key) ?? { year, month, delta: ZERO, count: 0 }
    bucket.delta = bucket.delta.plus(new Prisma.Decimal(tx.amount))
    bucket.count += 1
    buckets.set(key, bucket)
  }

  // Fill gaps between the first and current month so the timeline is contiguous.
  const first = transactions[0].occurredAt
  const now = new Date()
  const startYear = first.getUTCFullYear()
  const startMonth = first.getUTCMonth() + 1
  const endYear = now.getUTCFullYear()
  const endMonth = now.getUTCMonth() + 1

  const ordered: MonthlyBucket[] = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${month}`
    ordered.push(buckets.get(key) ?? { year, month, delta: ZERO, count: 0 })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  let running = ZERO
  const rows = ordered.map((b) => {
    running = running.plus(b.delta)
    return {
      domainAccountId: accountId,
      year: b.year,
      month: b.month,
      balance: running,
      transactionsCount: b.count,
    }
  })

  await prisma.$transaction([
    prisma.domainBalanceAnchor.deleteMany({ where: { domainAccountId: accountId } }),
    prisma.domainBalanceAnchor.createMany({ data: rows }),
  ])
}
