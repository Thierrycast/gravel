import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { errorResponse } from "@/lib/binance-route-helpers"
import { updateOwnedAssetPrices } from "@/lib/binance-sync"
import { jsonOk } from "@/lib/core/http"

export const dynamic = "force-dynamic"

async function handle() {
  try {
    const result = await updateOwnedAssetPrices()
    return jsonOk({
      summary: result,
      results: result,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET() {
  return handle()
}

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError
  return handle()
}
