import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runBinanceSync } from "@/lib/ingestion/provider-sync"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | { symbols?: string[] }
      | null

    const summary = await runBinanceSync({
      scope: "providers/binance/trades",
      resource: "trades",
      resources: ["trades"],
      symbols: body?.symbols,
    })

    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
