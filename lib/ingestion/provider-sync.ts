import { SourceProvider } from "@prisma/client"

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
    const summary = await rebuildAllDomainReadModels()
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
