import { SourceProvider } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { getApiKey } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await getApiKey()

    const [storedItems, latestRun] = await Promise.all([
      prisma.pluggyItem.count(),
      prisma.opsSyncRun.findFirst({
        where: { provider: SourceProvider.PLUGGY },
        orderBy: { startedAt: "desc" },
      }),
    ])

    return jsonOk({
      summary: {
        provider: "pluggy",
        healthy: true,
      },
      results: {
        storedItems,
        latestRun,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
