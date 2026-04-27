import { OpsRunStatus, SourceProvider } from "@prisma/client"

import {
  acquireSyncLock,
  completeOpsRun,
  failOpsRun,
  releaseSyncLock,
  startOpsRun,
  updateCheckpoint,
} from "@/lib/admin/ops"
import {
  projectBinanceReadModels,
  projectPluggyReadModels,
  rebuildAllDomainReadModels,
} from "@/lib/domain/projectors"
import { refreshDerivedCaches } from "@/lib/domain/derived"
import {
  type BinanceSyncResource,
  syncBinanceData,
} from "@/lib/binance-sync"
import {
  type SyncResource as PluggySyncResource,
  syncPluggyData,
} from "@/lib/pluggy-sync"

export async function runPluggySync(input: {
  scope: string
  resource: string
  itemId?: string | null
  resources?: PluggySyncResource[]
  pageSize?: number
}) {
  const lockKey = `pluggy:${input.resource}:${input.itemId ?? "all"}`
  const owner = await acquireSyncLock(lockKey)
  const run = await startOpsRun({
    provider: SourceProvider.PLUGGY,
    scope: input.scope,
    resource: input.resource,
    requestJson: JSON.stringify(input),
  })

  try {
    const summary = await syncPluggyData({
      itemId: input.itemId,
      resources: input.resources,
      pageSize: input.pageSize,
    })

    await projectPluggyReadModels()
    await updateCheckpoint({
      provider: SourceProvider.PLUGGY,
      resource: input.resource,
      cursorKey: input.itemId ?? "all",
      value: new Date().toISOString(),
      meta: summary,
    })
    await completeOpsRun(run.id, summary)

    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await failOpsRun(run.id, {
      provider: SourceProvider.PLUGGY,
      resource: input.resource,
      scopeId: input.itemId ?? undefined,
      message,
      meta: input,
    })
    throw error
  } finally {
    await releaseSyncLock(lockKey, owner)
  }
}

export async function runBinanceSync(input: {
  scope: string
  resource: string
  resources?: BinanceSyncResource[]
  symbols?: string[]
  includeZeroBalances?: boolean
}) {
  const lockKey = `binance:${input.resource}`
  const owner = await acquireSyncLock(lockKey)
  const run = await startOpsRun({
    provider: SourceProvider.BINANCE,
    scope: input.scope,
    resource: input.resource,
    requestJson: JSON.stringify(input),
  })

  try {
    const summary = await syncBinanceData({
      resources: input.resources,
      symbols: input.symbols,
      includeZeroBalances: input.includeZeroBalances,
    })

    await projectBinanceReadModels()

    const checkpointKeys =
      input.resource === "trades" && input.symbols?.length
        ? input.symbols
        : ["all"]

    for (const key of checkpointKeys) {
      await updateCheckpoint({
        provider: SourceProvider.BINANCE,
        resource: input.resource,
        cursorKey: key,
        value: new Date().toISOString(),
        meta: summary,
      })
    }

    await completeOpsRun(run.id, summary)
    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await failOpsRun(run.id, {
      provider: SourceProvider.BINANCE,
      resource: input.resource,
      scopeId: input.symbols?.join(",") || undefined,
      message,
      meta: input,
    })
    throw error
  } finally {
    await releaseSyncLock(lockKey, owner)
  }
}

export async function rebuildDomainFromStoredProviders() {
  const lockKey = "domain:rebuild"
  const owner = await acquireSyncLock(lockKey)
  const run = await startOpsRun({
    provider: SourceProvider.MANUAL,
    scope: "domain",
    resource: "rebuild",
  })

  try {
    const rebuilt = await rebuildAllDomainReadModels()
    const derived = await refreshDerivedCaches()
    const summary = {
      rebuilt,
      derived,
    }
    await updateCheckpoint({
      provider: SourceProvider.MANUAL,
      resource: "domain-rebuild",
      cursorKey: "all",
      value: new Date().toISOString(),
      meta: summary,
    })
    await completeOpsRun(run.id, summary)
    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await failOpsRun(run.id, {
      provider: SourceProvider.MANUAL,
      resource: "domain-rebuild",
      message,
    })
    throw error
  } finally {
    await releaseSyncLock(lockKey, owner)
  }
}

export async function runFullOperationalSync(input?: {
  pluggy?: {
    itemId?: string | null
    pageSize?: number
  }
  binance?: {
    symbols?: string[]
    includeZeroBalances?: boolean
  }
}) {
  const lockKey = "admin:sync:full"
  const owner = await acquireSyncLock(lockKey)
  const run = await startOpsRun({
    provider: SourceProvider.MANUAL,
    scope: "admin/full",
    resource: "sync-full",
    requestJson: JSON.stringify(input ?? {}),
  })

  try {
    const errors: Array<{ provider: "pluggy" | "binance"; message: string }> = []
    
    // Run Pluggy and Binance in parallel
    const [pluggyResult, binanceResult] = await Promise.allSettled([
      runPluggySync({
        scope: "admin/full/pluggy",
        resource: "full",
        itemId: input?.pluggy?.itemId,
        pageSize: input?.pluggy?.pageSize,
      }),
      runBinanceSync({
        scope: "admin/full/binance",
        resource: "full",
        symbols: input?.binance?.symbols,
        includeZeroBalances: input?.binance?.includeZeroBalances,
      })
    ])

    let pluggy: Awaited<ReturnType<typeof runPluggySync>> | null = null
    let binance: Awaited<ReturnType<typeof runBinanceSync>> | null = null

    if (pluggyResult.status === "fulfilled") {
      pluggy = pluggyResult.value
    } else {
      errors.push({
        provider: "pluggy",
        message: pluggyResult.reason instanceof Error ? pluggyResult.reason.message : "Erro desconhecido",
      })
    }

    if (binanceResult.status === "fulfilled") {
      binance = binanceResult.value
    } else {
      errors.push({
        provider: "binance",
        message: binanceResult.reason instanceof Error ? binanceResult.reason.message : "Erro desconhecido",
      })
    }

    const rebuilt = await rebuildAllDomainReadModels()
    const derived = await refreshDerivedCaches()

    const summary = {
      pluggy,
      binance,
      rebuilt,
      derived,
      errors,
    }

    await updateCheckpoint({
      provider: SourceProvider.MANUAL,
      resource: "sync-full",
      cursorKey: "all",
      value: new Date().toISOString(),
      meta: summary,
    })
    await completeOpsRun(
      run.id,
      summary,
      errors.length > 0 ? OpsRunStatus.ERROR : OpsRunStatus.SUCCESS
    )
    return summary
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    await failOpsRun(run.id, {
      provider: SourceProvider.MANUAL,
      resource: "sync-full",
      message,
      meta: input,
    })
    throw error
  } finally {
    await releaseSyncLock(lockKey, owner)
  }
}
