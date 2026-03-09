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
    const take = parseNumberParam(searchParams.get("take"), 50) ?? 50
    const provider = searchParams.get("provider")
    const status = searchParams.get("status")

    const results = await prisma.opsSyncRun.findMany({
      where: {
        provider: provider ? (provider as never) : undefined,
        status: status ? (status as never) : undefined,
      },
      orderBy: { startedAt: "desc" },
      take,
      include: {
        failures: true,
      },
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
