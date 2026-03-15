import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const rules = await prisma.categoryRule.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    })

    const categoryIds = rules
      .map((r) => r.domainCategoryId)
      .filter((id): id is string => id !== null)

    const categories = categoryIds.length
      ? await prisma.domainCategory.findMany({
          where: { id: { in: categoryIds } },
        })
      : []

    const categoryMap = new Map(categories.map((c) => [c.id, c]))

    const results = rules.map((rule) => ({
      ...rule,
      category: rule.domainCategoryId
        ? categoryMap.get(rule.domainCategoryId) ?? null
        : null,
    }))

    return jsonOk({ results })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { matchType, matchField, matchValue, domainCategoryId, priority, active, provider } = body

    if (!matchType || !matchField || !matchValue) {
      return jsonError(
        new Error("matchType, matchField e matchValue são obrigatórios"),
        400
      )
    }

    const rule = await prisma.categoryRule.create({
      data: {
        matchType,
        matchField,
        matchValue,
        domainCategoryId: domainCategoryId ?? null,
        priority: priority ?? 100,
        active: active ?? true,
        provider: provider ?? null,
      },
    })

    return jsonOk({ results: rule })
  } catch (error) {
    return jsonError(error)
  }
}
