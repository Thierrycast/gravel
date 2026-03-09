import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { errorResponse } from "@/lib/binance-route-helpers"
import { jsonOk } from "@/lib/core/http"
import { runBinanceSync } from "@/lib/ingestion/provider-sync"
import {
  getBinancePersistenceSummary,
  type BinanceSyncResource,
} from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const summary = await getBinancePersistenceSummary()
    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          resources?: BinanceSyncResource[]
          symbols?: string[]
          includeZeroBalances?: boolean
        }
      | null

    const summary = await runBinanceSync({
      scope: "legacy/binance/sync",
      resource: "legacy-sync",
      resources: Array.isArray(body?.resources) ? body.resources : undefined,
      symbols: Array.isArray(body?.symbols) ? body.symbols : undefined,
      includeZeroBalances: body?.includeZeroBalances === true,
    })

    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
