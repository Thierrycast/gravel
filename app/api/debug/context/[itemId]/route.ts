import { NextRequest } from "next/server"

import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ itemId: string }> }

async function getTransactionContext(itemId: string) {
  const transaction = await prisma.domainTransaction.findUnique({
    where: { id: itemId },
    include: {
      domainAccount: true,
      domainCategory: true,
      domainMerchant: true,
    },
  })

  if (!transaction) return null

  const [lends, source, enrichment, tagLinks] = await Promise.all([
    prisma.domainLend.findMany({
      where: {
        OR: [
          { domainTransactionId: itemId },
          { inflowTransactionId: itemId },
        ],
      },
    }),
    prisma.domainTransactionSource.findFirst({
      where: { domainTransactionId: itemId },
    }),
    prisma.transactionEnrichment.findFirst({
      where: { domainTransactionId: itemId },
    }),
    prisma.transactionTag.findMany({
      where: { domainTransactionId: itemId },
    }),
  ])

  const tags = tagLinks.length
    ? await prisma.tag.findMany({
        where: { id: { in: tagLinks.map((link) => link.tagId) } },
      })
    : []

  return {
    type: "transaction",
    item: transaction,
    relations: {
      account: transaction.domainAccount,
      category: transaction.domainCategory,
      merchant: transaction.domainMerchant,
      lends,
      source,
      enrichment,
      tags,
    },
  }
}

async function getLendContext(itemId: string) {
  const lend = await prisma.domainLend.findUnique({ where: { id: itemId } })
  if (!lend) return null

  const linkedTransactionIds = [
    lend.domainTransactionId,
    lend.inflowTransactionId,
  ].filter((value): value is string => Boolean(value))

  const transactions = linkedTransactionIds.length
    ? await prisma.domainTransaction.findMany({
        where: { id: { in: linkedTransactionIds } },
        include: {
          domainAccount: true,
          domainCategory: true,
          domainMerchant: true,
        },
      })
    : []

  return {
    type: "lend",
    item: lend,
    relations: {
      transactions,
    },
  }
}

async function getScenarioContext(itemId: string) {
  const scenario = await prisma.domainScenarioEvent.findUnique({
    where: { id: itemId },
  })

  return scenario
    ? {
        type: "scenario",
        item: scenario,
        relations: {},
      }
    : null
}

async function getGoalContext(itemId: string) {
  const goal = await prisma.goal.findUnique({ where: { id: itemId } })

  return goal
    ? {
        type: "goal",
        item: goal,
        relations: {},
      }
    : null
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { itemId } = await params
    const context =
      (await getTransactionContext(itemId)) ??
      (await getLendContext(itemId)) ??
      (await getScenarioContext(itemId)) ??
      (await getGoalContext(itemId))

    if (!context) {
      return jsonError(new Error("Item não encontrado"), 404)
    }

    return jsonOk({ results: context })
  } catch (error) {
    return jsonError(error)
  }
}
