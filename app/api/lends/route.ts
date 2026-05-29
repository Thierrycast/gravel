import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"

const PAYMENT_MATCH_LOOKBACK_DAYS = 7
const PAYMENT_MATCH_MAX_DAYS_FROM_DUE = 45

function amountNumber(value: unknown) {
  return Number(value ?? 0)
}

function maxAllowedAmountDifference(amount: number) {
  return Math.max(5, Math.abs(amount) * 0.05)
}

export async function GET() {
  const lends = await prisma.domainLend.findMany({
    orderBy: { dueDate: "asc" }
  })

  const pendingLends = lends.filter((lend) => lend.status === "PENDING")
  const attachedInflowIds = new Set(
    lends
      .map((lend) => lend.inflowTransactionId)
      .filter((value): value is string => Boolean(value)),
  )

  if (pendingLends.length === 0) {
    return NextResponse.json(serializeForJson(lends.map((lend) => ({
      ...lend,
      suggestedInflowTransactions: [],
    }))))
  }

  const earliestCreatedAt = pendingLends.reduce((earliest, lend) => {
    return lend.createdAt < earliest ? lend.createdAt : earliest
  }, pendingLends[0].createdAt)
  const from = new Date(
    earliestCreatedAt.getTime() -
      PAYMENT_MATCH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  )

  const inflows = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      direction: "INFLOW",
      occurredAt: { gte: from },
    },
    select: {
      id: true,
      description: true,
      amount: true,
      occurredAt: true,
      domainAccount: {
        select: { name: true },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
  })

  const enrichedLends = lends.map((lend) => {
    if (lend.status !== "PENDING") {
      return {
        ...lend,
        suggestedInflowTransactions: [],
      }
    }

    const expectedAmount = amountNumber(lend.amount)
    const maxDifference = maxAllowedAmountDifference(expectedAmount)
    const suggestions = inflows
      .filter((transaction) => !attachedInflowIds.has(transaction.id))
      .map((transaction) => {
        const transactionAmount = amountNumber(transaction.amount)
        const amountDifference = Math.abs(transactionAmount - expectedAmount)
        const daysFromDue = Math.abs(
          transaction.occurredAt.getTime() - lend.dueDate.getTime(),
        ) / (24 * 60 * 60 * 1000)

        return {
          transaction,
          amountDifference,
          daysFromDue,
          score: amountDifference * 100 + daysFromDue,
        }
      })
      .filter(
        ({ amountDifference, daysFromDue }) =>
          amountDifference <= maxDifference &&
          daysFromDue <= PAYMENT_MATCH_MAX_DAYS_FROM_DUE,
      )
      .sort((left, right) => left.score - right.score)
      .slice(0, 3)
      .map(({ transaction, amountDifference, daysFromDue }) => ({
        id: transaction.id,
        description: transaction.description ?? "Entrada sem descrição",
        amount: transaction.amount,
        date: transaction.occurredAt,
        occurredAt: transaction.occurredAt,
        accountName: transaction.domainAccount?.name ?? null,
        amountDifference,
        daysFromDue: Math.round(daysFromDue),
      }))

    return {
      ...lend,
      suggestedInflowTransactions: suggestions,
    }
  })

  return NextResponse.json(serializeForJson(enrichedLends))
}

export async function POST(request: Request) {
  const body = await request.json()
  const lend = await prisma.domainLend.create({
    data: {
      friendName: body.friendName,
      friendPhone: body.friendPhone,
      amount: body.amount,
      dueDate: new Date(body.dueDate),
      description: body.description,
      categoryId: body.categoryId,
      domainBillId: body.domainBillId,
      domainTransactionId: body.domainTransactionId,
      status: "PENDING",
    }
  })
  return NextResponse.json(serializeForJson(lend))
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  }
  await prisma.domainLend.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  if (!body.id) {
    return NextResponse.json({ error: "id obrigatório" }, { status: 400 })
  }

  const lend = await prisma.domainLend.update({
    where: { id: body.id },
    data: {
      status: body.status,
      amount: body.amount,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      friendName: typeof body.friendName === "string" ? body.friendName : undefined,
      friendPhone:
        typeof body.friendPhone === "string" || body.friendPhone === null
          ? body.friendPhone
          : undefined,
      description:
        typeof body.description === "string" || body.description === null
          ? body.description
          : undefined,
      categoryId:
        typeof body.categoryId === "string" || body.categoryId === null
          ? body.categoryId
          : undefined,
      domainBillId:
        typeof body.domainBillId === "string" || body.domainBillId === null
          ? body.domainBillId
          : undefined,
      domainTransactionId:
        typeof body.domainTransactionId === "string" || body.domainTransactionId === null
          ? body.domainTransactionId
          : undefined,
      inflowTransactionId: body.inflowTransactionId,
    }
  })
  return NextResponse.json(serializeForJson(lend))
}
