import { SourceProvider } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { fetchSpotAccount } from "@/lib/integrations/binance"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const account = await fetchSpotAccount()
    const latestRun = await prisma.opsSyncRun.findFirst({
      where: { provider: SourceProvider.BINANCE },
      orderBy: { startedAt: "desc" },
    })

    return jsonOk({
      summary: {
        provider: "binance",
        healthy: true,
      },
      results: {
        canTrade: account?.canTrade ?? null,
        updateTime: account?.updateTime ?? null,
        latestRun,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
