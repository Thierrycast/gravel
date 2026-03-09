import { SourceProvider } from "@prisma/client"

import { getBinancePersistenceSummary } from "@/lib/binance-sync"
import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [providerSummary, latestRun, latestFailure, checkpoints, domainStates] =
      await Promise.all([
        getBinancePersistenceSummary(),
        prisma.opsSyncRun.findFirst({
          where: { provider: SourceProvider.BINANCE },
          orderBy: { startedAt: "desc" },
        }),
        prisma.opsSyncFailure.findFirst({
          where: { provider: SourceProvider.BINANCE },
          orderBy: { createdAt: "desc" },
        }),
        prisma.opsSyncCheckpoint.findMany({
          where: { provider: SourceProvider.BINANCE },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        prisma.domainSyncState.findMany({
          where: { stateKey: { startsWith: "domain:binance:" } },
          orderBy: { updatedAt: "desc" },
        }),
      ])

    return jsonOk({
      summary: {
        provider: "binance",
        latestRunStatus: latestRun?.status ?? null,
      },
      results: {
        providerSummary,
        latestRun,
        latestFailure,
        checkpoints,
        domainStates,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
