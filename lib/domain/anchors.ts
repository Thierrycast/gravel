import { DomainTransactionDirection, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)

/**
 * Generates a balance anchor for a specific account and month.
 * A balance anchor is the state of the account balance at the END of a given month.
 */
export async function createBalanceAnchor(accountId: string, year: number, month: number) {
  // 1. Find the previous anchor to start from
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
  const startDate = previousAnchor 
    ? new Date(Date.UTC(previousAnchor.year, previousAnchor.month, 1)) 
    : new Date(0) // Beginning of time

  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) // End of the requested month

  // 2. Sum transactions between the start and end date
  const aggregations = await prisma.domainTransaction.aggregate({
    where: {
      domainAccountId: accountId,
      occurredAt: {
        gt: startDate,
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

  // 3. Persist the anchor
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
 */
export async function rebuildAccountAnchors(accountId: string) {
  const firstTx = await prisma.domainTransaction.findFirst({
    where: { domainAccountId: accountId, ignored: false },
    orderBy: { occurredAt: "asc" }
  })

  if (!firstTx) return

  const now = new Date()
  let currentYear = firstTx.occurredAt.getUTCFullYear()
  let currentMonth = firstTx.occurredAt.getUTCMonth() + 1

  while (
    currentYear < now.getUTCFullYear() || 
    (currentYear === now.getUTCFullYear() && currentMonth <= now.getUTCMonth())
  ) {
    await createBalanceAnchor(accountId, currentYear, currentMonth)
    
    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }
  }
}
