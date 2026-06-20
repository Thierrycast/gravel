import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"
import { getDomainGoals } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const all = searchParams.get("all") === "true"

    const data = await getDomainGoals(!all)
    const goals = data.results

    const summary = goals.reduce(
      (acc, goal) => {
        acc.totalTarget += Number(goal.targetAmount)
        acc.totalSaved += Number(goal.currentAmount)
        return acc
      },
      { totalTarget: 0, totalSaved: 0, overallProgress: 0 }
    )

    summary.overallProgress =
      summary.totalTarget > 0
        ? (summary.totalSaved / summary.totalTarget) * 100
        : 0

    return jsonOk({
      summary,
      results: goals,
      meta: { count: goals.length },
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      name,
      emoji,
      targetAmount,
      currentAmount,
      monthlyContribution,
      targetDate,
      matchCategorySlug,
      matchKeyword,
      matchDateStart,
    } = body

    if (!name || targetAmount == null) {
      return jsonError(new Error("Nome e valor alvo são obrigatórios"), 400)
    }

    const goal = await prisma.goal.create({
      data: {
        name,
        emoji: emoji || undefined,
        targetAmount,
        currentAmount: currentAmount ?? 0,
        monthlyContribution: monthlyContribution ?? 0,
        targetDate: targetDate ? new Date(targetDate) : null,
        matchCategorySlug: matchCategorySlug || null,
        matchKeyword: matchKeyword || null,
        matchDateStart: matchDateStart ? new Date(matchDateStart) : null,
      },
    })

    return jsonOk({ results: goal })
  } catch (error) {
    return jsonError(error)
  }
}
