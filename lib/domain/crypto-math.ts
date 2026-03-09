import { Prisma } from "@prisma/client"

const ZERO = new Prisma.Decimal(0)

type DecimalLike = Prisma.Decimal | null | undefined

export type CryptoTradePoint = {
  baseAsset: string | null
  quoteAsset: string | null
  price: Prisma.Decimal
  quantity: Prisma.Decimal
  commission?: DecimalLike
  commissionAsset?: string | null
  isBuyer?: boolean | null
  tradedAt?: Date | null
  symbol?: string | null
}

export type CryptoPositionState = {
  asset: string
  quoteAsset: string | null
  quantity: Prisma.Decimal
  totalCost: Prisma.Decimal
  averageCost: Prisma.Decimal | null
  realizedPnl: Prisma.Decimal
  firstTradeAt: Date | null
  lastTradeAt: Date | null
  tradeCount: number
  buyCount: number
  sellCount: number
  periodTradeCount: number
  periodBuyCount: number
  periodSellCount: number
  periodBuyQuantity: Prisma.Decimal
  periodSellQuantity: Prisma.Decimal
  periodBuyNotional: Prisma.Decimal
  periodSellNotional: Prisma.Decimal
  periodRealizedPnl: Prisma.Decimal
}

function decimal(value?: DecimalLike) {
  return value ?? ZERO
}

function isInWindow(date: Date | null | undefined, from?: Date, to?: Date) {
  if (!date) return !from && !to
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function buildInitialState(asset: string, quoteAsset?: string | null): CryptoPositionState {
  return {
    asset,
    quoteAsset: quoteAsset ?? null,
    quantity: ZERO,
    totalCost: ZERO,
    averageCost: null,
    realizedPnl: ZERO,
    firstTradeAt: null,
    lastTradeAt: null,
    tradeCount: 0,
    buyCount: 0,
    sellCount: 0,
    periodTradeCount: 0,
    periodBuyCount: 0,
    periodSellCount: 0,
    periodBuyQuantity: ZERO,
    periodSellQuantity: ZERO,
    periodBuyNotional: ZERO,
    periodSellNotional: ZERO,
    periodRealizedPnl: ZERO,
  }
}

export function computeCryptoPositionStates(
  trades: CryptoTradePoint[],
  options?: {
    asset?: string
    from?: Date
    to?: Date
  }
) {
  const states = new Map<string, CryptoPositionState>()
  const assetFilter = options?.asset?.toUpperCase()
  const to = options?.to

  const orderedTrades = [...trades]
    .filter((trade) => trade.baseAsset)
    .filter((trade) =>
      assetFilter ? trade.baseAsset?.toUpperCase() === assetFilter : true
    )
    .filter((trade) => {
      if (!to || !trade.tradedAt) return true
      return trade.tradedAt <= to
    })
    .sort((left, right) => {
      const leftTime = left.tradedAt?.getTime() ?? 0
      const rightTime = right.tradedAt?.getTime() ?? 0
      return leftTime - rightTime
    })

  for (const trade of orderedTrades) {
    const asset = trade.baseAsset as string
    const current = states.get(asset) ?? buildInitialState(asset, trade.quoteAsset)
    const commission = decimal(trade.commission)
    const notional = trade.price.mul(trade.quantity)
    const inWindow = isInWindow(trade.tradedAt, options?.from, to)

    current.tradeCount += 1
    current.firstTradeAt = current.firstTradeAt ?? trade.tradedAt ?? null
    current.lastTradeAt = trade.tradedAt ?? current.lastTradeAt
    current.quoteAsset = current.quoteAsset ?? trade.quoteAsset ?? null

    if (trade.isBuyer === false) {
      current.sellCount += 1

      const averageCost = current.quantity.greaterThan(0)
        ? current.totalCost.div(current.quantity)
        : ZERO
      const costRemoved = averageCost.mul(trade.quantity)
      const proceeds = trade.commissionAsset === trade.quoteAsset
        ? notional.minus(commission)
        : notional
      const quantityDelta = trade.commissionAsset === asset
        ? trade.quantity.plus(commission)
        : trade.quantity

      current.quantity = Prisma.Decimal.max(ZERO, current.quantity.minus(quantityDelta))
      current.totalCost = Prisma.Decimal.max(ZERO, current.totalCost.minus(costRemoved))
      current.realizedPnl = current.realizedPnl.plus(proceeds.minus(costRemoved))

      if (inWindow) {
        current.periodTradeCount += 1
        current.periodSellCount += 1
        current.periodSellQuantity = current.periodSellQuantity.plus(trade.quantity)
        current.periodSellNotional = current.periodSellNotional.plus(proceeds)
        current.periodRealizedPnl = current.periodRealizedPnl.plus(
          proceeds.minus(costRemoved)
        )
      }
    } else {
      current.buyCount += 1

      const quantityAdded = trade.commissionAsset === asset
        ? Prisma.Decimal.max(ZERO, trade.quantity.minus(commission))
        : trade.quantity
      const costAdded = trade.commissionAsset === trade.quoteAsset
        ? notional.plus(commission)
        : notional

      current.quantity = current.quantity.plus(quantityAdded)
      current.totalCost = current.totalCost.plus(costAdded)

      if (inWindow) {
        current.periodTradeCount += 1
        current.periodBuyCount += 1
        current.periodBuyQuantity = current.periodBuyQuantity.plus(quantityAdded)
        current.periodBuyNotional = current.periodBuyNotional.plus(costAdded)
      }
    }

    current.averageCost = current.quantity.greaterThan(0)
      ? current.totalCost.div(current.quantity)
      : null

    states.set(asset, current)
  }

  return states
}
