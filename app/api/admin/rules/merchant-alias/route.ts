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
          matchValue?: string
          merchantId?: string
          aliasName?: string
          active?: boolean
        }
      | null

    if (!body?.matchType || !body.matchValue) {
      return jsonError(new Error("matchType e matchValue sao obrigatorios"), 400)
    }

    const rule = await prisma.merchantAliasRule.create({
      data: {
        provider: body.provider ? SourceProvider[body.provider] : undefined,
        matchType: RuleMatchType[body.matchType],
        matchValue: body.matchValue,
        merchantId: body.merchantId,
        aliasName: body.aliasName,
        active: body.active ?? true,
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
