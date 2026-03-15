import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runFullOperationalSync } from "@/lib/ingestion/provider-sync"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          pluggy?: { itemId?: string | null; pageSize?: number }
          binance?: { symbols?: string[]; includeZeroBalances?: boolean }
        }
      | null

    const summary = await runFullOperationalSync(body ?? undefined)

    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
