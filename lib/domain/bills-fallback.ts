import { DomainAccountKind, Prisma, type SourceProvider } from "@prisma/client"

import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)
const NOISE_THRESHOLD = 0.01

export type BillWithFallback = {
  id: string
  domainAccountId: string | null
  dueDate: Date | null
  totalAmount: Prisma.Decimal | null
  minimumPaymentAmount: Prisma.Decimal | null
  status: string | null
  metadataJson: string | null
  currencyCode: string | null
  sourceProvider: SourceProvider
  sourceParentId: string | null
  isSynthetic?: boolean
}

function isCurrentMonthWindow(from?: Date, to?: Date, now = new Date()) {
  const reference = from ?? to ?? now
  return (
    reference.getUTCFullYear() === now.getUTCFullYear() &&
    reference.getUTCMonth() === now.getUTCMonth()
  )
}

function projectDueDateForMonth(referenceDueDate: Date | null | undefined, targetDate: Date) {
  const day = referenceDueDate?.getUTCDate() ?? 15
  const year = targetDate.getUTCFullYear()
  const month = targetDate.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12, 0, 0))
}

function hasMeaningfulBillAmount(amount: Prisma.Decimal | null | undefined) {
  return Math.abs(Number(amount?.toString() ?? "0")) >= NOISE_THRESHOLD
}

export async function listBillsWithFallback(options: {
  from?: Date
  to?: Date
  provider?: SourceProvider
  accountId?: string
  skip?: number
  take?: number
}) {
  const where = {
    sourceProvider: options.provider,
    domainAccountId: options.accountId,
    dueDate: options.from || options.to
      ? {
          gte: options.from,
          lte: options.to,
        }
      : undefined,
  }

  const bills = await prisma.domainBill.findMany({
    where,
    orderBy: [{ dueDate: "desc" }, { updatedAt: "desc" }],
    skip: options.skip,
    take: options.take,
  })

  if (!isCurrentMonthWindow(options.from, options.to)) {
    return bills as BillWithFallback[]
  }

  const representedAccountIds = new Set(
    bills
      .filter((bill) => bill.domainAccountId && hasMeaningfulBillAmount(bill.totalAmount))
      .map((bill) => bill.domainAccountId)
      .filter((value): value is string => Boolean(value)),
  )

  const cardAccounts = await prisma.domainAccount.findMany({
    where: {
      id: options.accountId,
      sourceProvider: options.provider,
      kind: DomainAccountKind.CARD,
      balance: { gt: ZERO },
    },
    select: {
      id: true,
      kind: true,
      balance: true,
      currencyCode: true,
      sourceProvider: true,
      sourceParentId: true,
    },
  })

  const fallbackAccounts = cardAccounts.filter(
    (account) => !representedAccountIds.has(account.id),
  )

  if (fallbackAccounts.length === 0) {
    return bills as BillWithFallback[]
  }

  const latestBills = await prisma.domainBill.findMany({
    where: {
      domainAccountId: { in: fallbackAccounts.map((account) => account.id) },
      dueDate: { not: null },
    },
    orderBy: [{ dueDate: "desc" }, { updatedAt: "desc" }],
    select: {
      domainAccountId: true,
      dueDate: true,
      minimumPaymentAmount: true,
    },
  })

  const latestBillByAccountId = new Map<
    string,
    { dueDate: Date | null; minimumPaymentAmount: Prisma.Decimal | null }
  >()
  for (const bill of latestBills) {
    if (!bill.domainAccountId || latestBillByAccountId.has(bill.domainAccountId)) {
      continue
    }
    latestBillByAccountId.set(bill.domainAccountId, {
      dueDate: bill.dueDate,
      minimumPaymentAmount: bill.minimumPaymentAmount,
    })
  }

  const targetDate = options.from ?? options.to ?? new Date()
  const syntheticBills = fallbackAccounts.map((account) => {
    const latestBill = latestBillByAccountId.get(account.id)
    const totalAmount = new Prisma.Decimal(account.balance?.toString() ?? "0").abs()
    const minimumPayment = latestBill?.minimumPaymentAmount
      ? Prisma.Decimal.min(totalAmount, latestBill.minimumPaymentAmount.abs())
      : ZERO

    return {
      id: `synthetic:${account.id}:${targetDate.getUTCFullYear()}-${String(targetDate.getUTCMonth() + 1).padStart(2, "0")}`,
      domainAccountId: account.id,
      dueDate: projectDueDateForMonth(latestBill?.dueDate, targetDate),
      totalAmount,
      minimumPaymentAmount: minimumPayment,
      status: "OPEN",
      metadataJson: JSON.stringify({
        synthetic: true,
        source: "card-balance-fallback",
      }),
      currencyCode: account.currencyCode,
      sourceProvider: account.sourceProvider,
      sourceParentId: account.sourceParentId,
      isSynthetic: true,
    } satisfies BillWithFallback
  })

  return [...(bills as BillWithFallback[]), ...syntheticBills]
}
