import { RuleMatchType, SourceProvider } from "@prisma/client"

import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          provider?: keyof typeof SourceProvider
          matchType?: keyof typeof RuleMatchType
          matchField?: string
          matchValue?: string
          domainCategoryId?: string
          active?: boolean
          priority?: number
        }
      | null

    if (!body?.matchType || !body.matchField || !body.matchValue) {
      return jsonError(new Error("matchType, matchField e matchValue sao obrigatorios"), 400)
    }

    const rule = await prisma.categoryRule.create({
      data: {
        provider: body.provider ? SourceProvider[body.provider] : undefined,
        matchType: RuleMatchType[body.matchType],
        matchField: body.matchField,
        matchValue: body.matchValue,
        domainCategoryId: body.domainCategoryId,
        active: body.active ?? true,
        priority: body.priority ?? 100,
      },
    })

    return jsonOk({
      summary: {
        created: true,
      },
      results: rule,
    })
  } catch (error) {
    return jsonError(error)
  }
}
