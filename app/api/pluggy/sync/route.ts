import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { runPluggySync } from "@/lib/ingestion/provider-sync"
import {
  getPluggyPersistenceSummary,
  type SyncResource,
} from "@/lib/pluggy-sync"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const summary = await getPluggyPersistenceSummary()
    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          itemId?: string | null
          resources?: SyncResource[]
          pageSize?: number
        }
      | null

    const summary = await runPluggySync({
      scope: "legacy/pluggy/sync",
      resource: "legacy-sync",
      itemId: body?.itemId ?? undefined,
      resources: Array.isArray(body?.resources) ? body.resources : undefined,
      pageSize:
        typeof body?.pageSize === "number" && body.pageSize > 0
          ? body.pageSize
          : undefined,
    })

    return jsonOk({
      summary,
      results: summary,
    })
  } catch (error) {
    return jsonError(error)
  }
}
