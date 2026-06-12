import { OpsRunStatus } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const LOOKBACK_HOURS = 24

export async function GET() {
  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)

    const [latestError, latestSuccess] = await Promise.all([
      prisma.opsSyncRun.findFirst({
        where: {
          status: OpsRunStatus.ERROR,
          startedAt: { gte: since },
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          provider: true,
          resource: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          errorMessage: true,
        },
      }),
      prisma.opsSyncRun.findFirst({
        where: { status: OpsRunStatus.SUCCESS },
        orderBy: { startedAt: "desc" },
        select: { startedAt: true, provider: true },
      }),
    ])

    const supersededBySuccess =
      latestError &&
      latestSuccess &&
      latestSuccess.startedAt.getTime() > latestError.startedAt.getTime()

    return jsonOk({
      summary: {
        hasFailure: !!latestError && !supersededBySuccess,
        lookbackHours: LOOKBACK_HOURS,
      },
      results: {
        failure: supersededBySuccess ? null : latestError,
        latestSuccess,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
