import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { parseNumberParam } from "@/lib/core/filters"
import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const take = parseNumberParam(searchParams.get("take"), 100) ?? 100
    const provider = searchParams.get("provider")

    const results = await prisma.opsSyncCheckpoint.findMany({
      where: {
        provider: provider ? (provider as never) : undefined,
      },
      orderBy: { updatedAt: "desc" },
      take,
    })

    return jsonOk({
      summary: {
        total: results.length,
      },
      results,
      meta: {
        take,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
