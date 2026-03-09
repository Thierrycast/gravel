import { SourceProvider } from "@prisma/client"

import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { reprocessProviderRecord } from "@/lib/domain/projectors"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          provider?: keyof typeof SourceProvider
          resource?: string
          externalId?: string
        }
      | null

    if (!body?.provider || !body.resource || !body.externalId) {
      return jsonError(new Error("provider, resource e externalId sao obrigatorios"), 400)
    }

    const results = await reprocessProviderRecord({
      provider: SourceProvider[body.provider],
      resource: body.resource,
      externalId: body.externalId,
    })

    return jsonOk({
      summary: results,
      results,
    })
  } catch (error) {
    return jsonError(error)
  }
}
