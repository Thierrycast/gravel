import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ goalId: string }> }

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { goalId } = await params

    const goal = await prisma.goal.findUnique({ where: { id: goalId } })

    if (!goal) {
      return jsonError(new Error("Meta nao encontrada"), 404)
    }

    return jsonOk({ results: goal })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { goalId } = await params
    const body = await request.json()

    const { name, emoji, targetAmount, currentAmount, monthlyContribution, targetDate, active } =
      body

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (emoji !== undefined) data.emoji = emoji
    if (targetAmount !== undefined) data.targetAmount = targetAmount
    if (currentAmount !== undefined) data.currentAmount = currentAmount
    if (monthlyContribution !== undefined) data.monthlyContribution = monthlyContribution
    if (targetDate !== undefined) data.targetDate = targetDate ? new Date(targetDate) : null
    if (active !== undefined) data.active = active

    const goal = await prisma.goal.update({
      where: { id: goalId },
      data,
    })

    return jsonOk({ results: goal })
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
