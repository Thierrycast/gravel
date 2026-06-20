import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"
import { enrichGoalWithAutoTransactions } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ goalId: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { goalId } = await params

    const goal = await prisma.goal.findUnique({ where: { id: goalId } })

    if (!goal) {
      return jsonError(new Error("Meta nao encontrada"), 404)
    }

    const enriched = await enrichGoalWithAutoTransactions(goal)

    return jsonOk({ results: enriched })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { goalId } = await params
    const body = await request.json()

    const {
      name,
      emoji,
      targetAmount,
      currentAmount,
      monthlyContribution,
      targetDate,
      active,
      matchCategorySlug,
      matchKeyword,
      matchDateStart,
    } = body

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (emoji !== undefined) data.emoji = emoji
    if (targetAmount !== undefined) data.targetAmount = targetAmount
    if (currentAmount !== undefined) data.currentAmount = currentAmount
    if (monthlyContribution !== undefined) data.monthlyContribution = monthlyContribution
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null
    if (active !== undefined) data.active = active
    if (matchCategorySlug !== undefined) data.matchCategorySlug = matchCategorySlug || null
    if (matchKeyword !== undefined) data.matchKeyword = matchKeyword || null
    if (matchDateStart !== undefined) data.matchDateStart = matchDateStart ? new Date(matchDateStart) : null

    const goal = await prisma.goal.update({
      where: { id: goalId },
      data,
    })

    const enriched = await enrichGoalWithAutoTransactions(goal)

    return jsonOk({ results: enriched })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { goalId } = await params

    await prisma.goal.update({
      where: { id: goalId },
      data: { active: false },
    })

    return jsonOk({ status: "deleted" })
  } catch (error) {
    return jsonError(error)
  }
}
