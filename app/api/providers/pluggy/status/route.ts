import { SourceProvider } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { getPluggyPersistenceSummary } from "@/lib/pluggy-sync"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [providerSummary, latestRun, latestFailure, checkpoints, domainStates] =
      await Promise.all([
        getPluggyPersistenceSummary(),
        prisma.opsSyncRun.findFirst({
          where: { provider: SourceProvider.PLUGGY },
          orderBy: { startedAt: "desc" },
        }),
        prisma.opsSyncFailure.findFirst({
          where: { provider: SourceProvider.PLUGGY },
          orderBy: { createdAt: "desc" },
        }),
        prisma.opsSyncCheckpoint.findMany({
          where: { provider: SourceProvider.PLUGGY },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        prisma.domainSyncState.findMany({
          where: { stateKey: { startsWith: "domain:pluggy:" } },
          orderBy: { updatedAt: "desc" },
        }),
      ])

    return jsonOk({
      summary: {
        provider: "pluggy",
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
