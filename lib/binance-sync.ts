import { createHash } from "node:crypto"

import { Prisma } from "@prisma/client"

import {
  fetchExchangeInfo,
  fetchMyTrades,
  fetchSpotAccount,
  fetchTickerPrices,
  selectPreferredTradingSymbol,
} from "@/lib/integrations/binance"
import { prisma } from "@/lib/prisma"

export type BinanceSyncResource = "assets" | "trades" | "prices"

type BinanceSyncOptions = {
  resources?: BinanceSyncResource[]
  symbols?: string[]
  includeZeroBalances?: boolean
}

type BinanceAssetBalance = {
  asset?: string
  free?: string
  locked?: string
}

type BinanceTrade = {
  id?: number
  orderId?: number
  symbol?: string
  price?: string
  qty?: string
  quoteQty?: string
  commission?: string
  commissionAsset?: string
  isBuyer?: boolean
  isMaker?: boolean
  isBestMatch?: boolean
  time?: number
}

const defaultResources: BinanceSyncResource[] = ["assets", "trades", "prices"]

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

async function createIfNew(operation: () => Promise<unknown>) {
  try {
    await operation()
    return 1
  } catch (error) {
    if (isUniqueError(error)) return 0
    throw error
  }
}

function decimalFromString(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") {
    return new Prisma.Decimal(0)
  }

  return new Prisma.Decimal(value)
}

function decimalOrNull(value: string | number | null | undefined) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  return new Prisma.Decimal(value)
}

function hashPayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function toDateFromMs(value: number | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeAssetBalances(
  balances: BinanceAssetBalance[],
  includeZeroBalances = false
) {
  return balances
    .map((balance) => {
      const free = decimalFromString(balance.free)
      const locked = decimalFromString(balance.locked)
      const total = free.plus(locked)

      return {
        asset: balance.asset?.toUpperCase() ?? "",
        free,
        locked,
        total,
        raw: balance,
      }
    })
    .filter((balance) => {
      if (!balance.asset) return false
      if (includeZeroBalances) return true
      return !balance.total.isZero()
    })
}

async function getLatestBalanceAssets(includeZeroBalances = false) {
  const assets = await prisma.binanceAssetRecord.findMany({
    orderBy: { asset: "asc" },
  })

  const snapshots = await Promise.all(
    assets.map(async (asset) => {
      const latestBalance = await prisma.binanceAssetBalanceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      })

      const latestPrice = await prisma.binanceAssetPriceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      })

      return {
        asset: asset.asset,
        balance: latestBalance,
        price: latestPrice,
      }
    })
  )

  return snapshots.filter((entry) => {
    if (includeZeroBalances) return true
    return entry.balance ? !new Prisma.Decimal(entry.balance.total).isZero() : false
  })
}

export async function getTrackedBinanceSymbols() {
  const [assets, trades, exchangeInfo] = await Promise.all([
    prisma.binanceAssetRecord.findMany({
      orderBy: { asset: "asc" },
    }),
    prisma.binanceTradeRecord.findMany({
      distinct: ["symbol"],
      select: { symbol: true },
      orderBy: { symbol: "asc" },
    }),
    fetchExchangeInfo(),
  ])

  const symbols = new Set<string>()

  for (const trade of trades) {
    if (trade.symbol) {
      symbols.add(trade.symbol)
    }
  }

  const latestBalances = await getLatestBalanceAssets(false)
  for (const asset of latestBalances) {
    const selected = selectPreferredTradingSymbol(asset.asset, exchangeInfo)
    if (selected?.symbol && selected.synthetic !== true) {
      symbols.add(selected.symbol)
    }
  }

  for (const asset of assets) {
    const selected = selectPreferredTradingSymbol(asset.asset, exchangeInfo)
    if (selected?.symbol && selected.synthetic !== true) {
      symbols.add(selected.symbol)
    }
  }

  return Array.from(symbols).sort()
}

async function syncAssets(includeZeroBalances = false) {
  const account = await fetchSpotAccount()
  const balances = normalizeAssetBalances(
    Array.isArray(account?.balances) ? account.balances : [],
    includeZeroBalances
  )

  const accountSnapshotInserted = await createIfNew(() =>
    prisma.binanceAccountSnapshot.create({
      data: {
        payloadHash: hashPayload(account),
        payloadJson: JSON.stringify(account),
        updateTime: toDateFromMs(
          typeof account?.updateTime === "number" ? account.updateTime : undefined
        ) ?? undefined,
      },
    })
  )

  let assetRecordsInserted = 0
  let balanceSnapshotsInserted = 0

  for (const balance of balances) {
    assetRecordsInserted += await createIfNew(() =>
      prisma.binanceAssetRecord.create({
        data: {
          asset: balance.asset,
        },
      })
    )

    balanceSnapshotsInserted += await createIfNew(() =>
      prisma.binanceAssetBalanceSnapshot.create({
        data: {
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          total: balance.total,
          payloadHash: hashPayload(balance.raw),
          payloadJson: JSON.stringify(balance.raw),
        },
      })
    )
  }

  return {
    accountSnapshotInserted,
    assetRecordsInserted,
    balanceSnapshotsInserted,
    balances,
  }
}

async function syncTrades(inputSymbols?: string[]) {
  const exchangeInfo = await fetchExchangeInfo()
  const symbols = inputSymbols?.length ? inputSymbols : await getTrackedBinanceSymbols()

  let inserted = 0
  const perSymbol: Record<string, number> = {}

  for (const symbol of symbols) {
    let fromId: number | undefined
    let keepGoing = true
    perSymbol[symbol] = 0

    const symbolInfo = Array.isArray(exchangeInfo.symbols)
      ? exchangeInfo.symbols.find((entry) => entry.symbol === symbol)
      : null

    while (keepGoing) {
      const page = (await fetchMyTrades({
        symbol,
        limit: 1000,
        fromId,
      })) as BinanceTrade[]

      if (!Array.isArray(page) || page.length === 0) {
        break
      }

      for (const trade of page) {
        if (trade.id === undefined) continue

        const currentInserted = await createIfNew(() =>
          prisma.binanceTradeRecord.create({
            data: {
              symbol,
              tradeId: String(trade.id),
              orderId:
                trade.orderId !== undefined ? String(trade.orderId) : undefined,
              baseAsset: symbolInfo?.baseAsset ?? undefined,
              quoteAsset: symbolInfo?.quoteAsset ?? undefined,
              price: decimalFromString(trade.price),
              quantity: decimalFromString(trade.qty),
              quoteQuantity: decimalOrNull(trade.quoteQty) ?? undefined,
              commission: decimalOrNull(trade.commission) ?? undefined,
              commissionAsset: trade.commissionAsset ?? undefined,
              isBuyer: trade.isBuyer ?? undefined,
              isMaker: trade.isMaker ?? undefined,
              isBestMatch: trade.isBestMatch ?? undefined,
              tradedAt: toDateFromMs(trade.time) ?? undefined,
              payloadJson: JSON.stringify(trade),
            },
          })
        )

        inserted += currentInserted
        perSymbol[symbol] += currentInserted
      }

      if (page.length < 1000) {
        keepGoing = false
      } else {
        const lastTradeId = page[page.length - 1]?.id
        if (typeof lastTradeId !== "number") {
          keepGoing = false
        } else {
          fromId = lastTradeId + 1
        }
      }
    }
  }

  return {
    symbols,
    inserted,
    perSymbol,
  }
}

async function syncPrices() {
  const latestAssets = await getLatestBalanceAssets(false)
  const exchangeInfo = await fetchExchangeInfo()

  const syntheticPrices: Array<{
    asset: string
    symbol: string
    quoteAsset: string
    price: number
    synthetic: true
  }> = []
  const symbolToAsset = new Map<string, { asset: string; quoteAsset: string }>()

  for (const asset of latestAssets) {
    const selected = selectPreferredTradingSymbol(asset.asset, exchangeInfo)
    if (!selected) continue

    if (selected.synthetic) {
      syntheticPrices.push({
        asset: asset.asset,
        symbol: selected.symbol,
        quoteAsset: selected.quoteAsset,
        price: Number(selected.price ?? 1),
        synthetic: true,
      })
      continue
    }

    symbolToAsset.set(selected.symbol, {
      asset: asset.asset,
      quoteAsset: selected.quoteAsset,
    })
  }

  const livePrices = symbolToAsset.size
    ? ((await fetchTickerPrices({
        symbols: Array.from(symbolToAsset.keys()),
      })) as Array<{ symbol?: string; price?: string }>)
    : []

  let inserted = 0

  for (const current of livePrices) {
    const currentSymbol = current.symbol ?? ""
    const mapped = symbolToAsset.get(currentSymbol)
    if (!mapped) continue

    inserted += await createIfNew(() =>
      prisma.binanceAssetPriceSnapshot.create({
        data: {
          asset: mapped.asset,
          symbol: currentSymbol,
          quoteAsset: mapped.quoteAsset,
          price: decimalFromString(current.price),
          payloadHash: hashPayload(current),
          payloadJson: JSON.stringify(current),
        },
      })
    )
  }

  for (const synthetic of syntheticPrices) {
    inserted += await createIfNew(() =>
      prisma.binanceAssetPriceSnapshot.create({
        data: {
          asset: synthetic.asset,
          symbol: synthetic.symbol,
          quoteAsset: synthetic.quoteAsset,
          price: decimalFromString(synthetic.price),
          payloadHash: hashPayload(synthetic),
          payloadJson: JSON.stringify(synthetic),
        },
      })
    )
  }

  return {
    trackedAssets: latestAssets.length,
    trackedSymbols: symbolToAsset.size,
    inserted,
  }
}

export async function syncBinanceData(options: BinanceSyncOptions = {}) {
  const resources = options.resources?.length
    ? options.resources
    : defaultResources

  const before = await getBinancePersistenceSummary()
  const run = await prisma.binanceSyncRun.create({
    data: {
      scope: "default",
      resources: resources.join(","),
      status: "RUNNING",
    },
  })

  try {
    const writes = {
      accountSnapshots: 0,
      assets: 0,
      balances: 0,
      trades: 0,
      prices: 0,
    }

    let tradeSymbols: string[] = options.symbols ?? []

    if (resources.includes("assets")) {
      const result = await syncAssets(options.includeZeroBalances)
      writes.accountSnapshots += result.accountSnapshotInserted
      writes.assets += result.assetRecordsInserted
      writes.balances += result.balanceSnapshotsInserted
    }

    if (resources.includes("trades")) {
      const tradesResult = await syncTrades(options.symbols)
      writes.trades += tradesResult.inserted
      tradeSymbols = tradesResult.symbols
    }

    if (resources.includes("prices")) {
      const pricesResult = await syncPrices()
      writes.prices += pricesResult.inserted
    }

    const after = await getBinancePersistenceSummary()
    const summary = {
      trackedSymbols: tradeSymbols,
      inserted: {
        accountSnapshots: after.accountSnapshots - before.accountSnapshots,
        assets: after.assets - before.assets,
        balanceSnapshots: after.balanceSnapshots - before.balanceSnapshots,
        trades: after.trades - before.trades,
        priceSnapshots: after.priceSnapshots - before.priceSnapshots,
      },
      writes,
    }

    await prisma.binanceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        summaryJson: JSON.stringify(summary),
        finishedAt: new Date(),
      },
    })

    return summary
  } catch (error) {
    await prisma.binanceSyncRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        finishedAt: new Date(),
      },
    })

    throw error
  }
}

export async function updateOwnedAssetPrices() {
  return syncPrices()
}

export async function getBinancePersistenceSummary() {
  const [
    accountSnapshots,
    assets,
    balanceSnapshots,
    trades,
    priceSnapshots,
    latestRun,
  ] = await Promise.all([
    prisma.binanceAccountSnapshot.count(),
    prisma.binanceAssetRecord.count(),
    prisma.binanceAssetBalanceSnapshot.count(),
    prisma.binanceTradeRecord.count(),
    prisma.binanceAssetPriceSnapshot.count(),
    prisma.binanceSyncRun.findFirst({
      orderBy: { startedAt: "desc" },
    }),
  ])

  return {
    accountSnapshots,
    assets,
    balanceSnapshots,
    trades,
    priceSnapshots,
    latestRun,
  }
}

export async function getPersistedBinanceAssets(includeZeroBalances = false) {
  const entries = await getLatestBalanceAssets(includeZeroBalances)

  return entries.map((entry) => ({
    asset: entry.asset,
    free: entry.balance?.free ?? null,
    locked: entry.balance?.locked ?? null,
    total: entry.balance?.total ?? null,
    balanceFetchedAt: entry.balance?.fetchedAt ?? null,
    price: entry.price?.price ?? null,
    priceSymbol: entry.price?.symbol ?? null,
    quoteAsset: entry.price?.quoteAsset ?? null,
    priceFetchedAt: entry.price?.fetchedAt ?? null,
  }))
}

export async function getPersistedBinanceTrades(options?: {
  symbol?: string | null
  asset?: string | null
  take?: number
}) {
  return prisma.binanceTradeRecord.findMany({
    where: {
      symbol: options?.symbol ?? undefined,
      OR: options?.asset
        ? [{ baseAsset: options.asset }, { quoteAsset: options.asset }]
        : undefined,
    },
    orderBy: [{ tradedAt: "desc" }, { createdAt: "desc" }],
    take: options?.take,
  })
}
