import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { resolveMerchantLogoCache } from "@/lib/domain/enrichment/logo-dev"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | { limit?: number; describe?: boolean }
      | null
    const summary = await resolveMerchantLogoCache({
      limit: body?.limit,
      describe: body?.describe,
    })
    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
