import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runBinanceSync } from "@/lib/ingestion/provider-sync"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const summary = await runBinanceSync({
      scope: "providers/binance/prices",
      resource: "prices",
      resources: ["prices"],
    })

    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
