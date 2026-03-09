import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runPluggySync } from "@/lib/ingestion/provider-sync"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | { itemId?: string | null; pageSize?: number }
      | null

    const summary = await runPluggySync({
      scope: "providers/pluggy/transactions",
      resource: "transactions",
      itemId: body?.itemId,
      pageSize: body?.pageSize,
      resources: ["transactions", "merchants"],
    })

    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
