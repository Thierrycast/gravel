import { jsonError, jsonOk } from "@/lib/core/http"
import { refreshPluggyItemAndWait } from "@/lib/pluggy-item-refresh"
import { rebuildAllDomainReadModels } from "@/lib/domain/projectors"
import { refreshDerivedCaches } from "@/lib/domain/derived"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * POST /api/pluggy/items/{itemId}/refresh
 * Dispara PATCH /items/{id} e acompanha o sync até um estado terminal.
 * Se `wait=false` no body, retorna imediatamente após disparar (fire-and-forget)
 * para a UI acompanhar via GET /api/pluggy/items.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await context.params
    if (!itemId) {
      return jsonError(new Error("itemId obrigatório"), 400)
    }

    const body = await request.json().catch(() => ({}) as Record<string, unknown>)
    const wait = body?.wait !== false
    const parameters =
      body?.parameters && typeof body.parameters === "object"
        ? (body.parameters as Record<string, unknown>)
        : undefined

    if (!wait) {
      void refreshPluggyItemAndWait(itemId, { parameters })
        .then(async (result) => {
          if (result.reprojected) {
            await rebuildAllDomainReadModels()
            await refreshDerivedCaches()
          }
        })
        .catch((err) => console.error("[item-refresh] async error:", err))
      return jsonOk({ results: { itemId, triggered: true } })
    }

    const result = await refreshPluggyItemAndWait(itemId, { parameters })

    // Reprojeta os read models de domínio quando novos dados chegaram.
    if (result.reprojected) {
      await rebuildAllDomainReadModels()
      await refreshDerivedCaches()
    }

    return jsonOk({ results: result })
  } catch (error) {
    return jsonError(error)
  }
}
