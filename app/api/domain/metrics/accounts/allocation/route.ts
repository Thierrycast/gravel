import { jsonError, jsonOk } from "@/lib/core/http"
import { getAccountAllocationMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const metrics = await getAccountAllocationMetrics(searchParams)

    const byKindMap: Record<string, number> = {}
    for (const entry of metrics.byKind) {
      byKindMap[entry.kind] = Number(entry.balance)
    }

    return jsonOk({
      summary: {
        totalBalance: Number(metrics.total),
        byKind: byKindMap,
      },
      results: metrics.byAccount.map((a) => ({
        accountId: a.id,
        name: a.name,
        type: a.kind,
        balance: Number(a.balance),
        percentage: Number(a.sharePercent),
      })),
      meta: {
        counts: metrics.counts,
        byKind: metrics.byKind,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
