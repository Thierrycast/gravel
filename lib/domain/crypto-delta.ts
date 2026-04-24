import { DomainTransaction, DomainTransactionDirection, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getCryptoLogo } from "@/lib/domain/utils"

const ZERO = new Prisma.Decimal(0)
const MAX_CAS_RETRIES = 5

type CryptoTradeMetadata = {
  asset: string
  price: Prisma.Decimal
}

function parseCryptoMetadata(metadataJson: string | null): CryptoTradeMetadata | null {
  if (!metadataJson) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(metadataJson)
  } catch (err) {
    console.warn("[crypto-delta] Malformed metadataJson, skipping transaction", { err })
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const meta = parsed as Record<string, unknown>
  const asset =
    typeof meta.baseAsset === "string"
      ? meta.baseAsset
      : typeof meta.asset === "string"
        ? meta.asset
        : null
  if (!asset) return null
  const rawPrice = meta.price
  const price =
    typeof rawPrice === "number" || typeof rawPrice === "string"
      ? new Prisma.Decimal(rawPrice)
      : ZERO
  return { asset, price }
}

/**
 * Updates the materialized crypto position for a given asset based on a new transaction.
 * Uses optimistic concurrency (compare-and-swap on lastUpdatedAt) to avoid lost
 * updates when multiple ingestion paths touch the same asset concurrently.
 */
export async function applyCryptoTransactionDelta(transaction: DomainTransaction) {
  if (transaction.ignored) return
  const meta = parseCryptoMetadata(transaction.metadataJson)
  if (!meta) return

  const quantity = new Prisma.Decimal(transaction.amount).abs()
  const direction = transaction.direction

  for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
    const applied = await tryApplyDelta(meta.asset, quantity, meta.price, direction, transaction.id)
    if (applied) return
  }
  throw new Error(
    `[crypto-delta] Failed to apply delta for asset=${meta.asset} after ${MAX_CAS_RETRIES} attempts (concurrent writers)`,
  )
}

async function tryApplyDelta(
  asset: string,
  quantity: Prisma.Decimal,
  price: Prisma.Decimal,
  direction: DomainTransactionDirection,
  transactionId: string,
): Promise<boolean> {
  // 1. Load current position (or null if it doesn't exist yet).
  const position = await prisma.domainCryptoPosition.findUnique({ where: { asset } })

  // 2. Compute the new state off the read we just did.
  const prevQuantity = position ? new Prisma.Decimal(position.quantity) : ZERO
  const prevCostBasis = position ? new Prisma.Decimal(position.costBasis) : ZERO
  const prevAveragePrice = position ? new Prisma.Decimal(position.averagePrice) : ZERO

  let newQuantity = prevQuantity
  let newCostBasis = prevCostBasis
  let newAveragePrice = prevAveragePrice

  if (direction === DomainTransactionDirection.INFLOW) {
    newQuantity = prevQuantity.plus(quantity)
    newCostBasis = prevCostBasis.plus(quantity.mul(price))
    newAveragePrice = newQuantity.greaterThan(0)
      ? newCostBasis.div(newQuantity)
      : ZERO
  } else if (direction === DomainTransactionDirection.OUTFLOW) {
    // Anomaly: selling more than we hold (short sale or missing buy upstream).
    if (quantity.greaterThan(prevQuantity)) {
      console.warn("[crypto-delta] Oversell anomaly: sell quantity exceeds position", {
        asset,
        transactionId,
        heldQuantity: prevQuantity.toString(),
        sellQuantity: quantity.toString(),
      })
    }
    // Anomaly: first-ever event is a sale — position didn't exist before.
    if (!position) {
      console.warn("[crypto-delta] First event is OUTFLOW with no prior position", {
        asset,
        transactionId,
        sellQuantity: quantity.toString(),
      })
    }
    const quantityToRemove = Prisma.Decimal.min(prevQuantity, quantity)
    const costToRemove = prevAveragePrice.mul(quantityToRemove)
    newQuantity = Prisma.Decimal.max(ZERO, prevQuantity.minus(quantity))
    newCostBasis = Prisma.Decimal.max(ZERO, prevCostBasis.minus(costToRemove))
    // Average price unchanged on a sell (weighted-average cost method).
  }

  // 3. Persist via compare-and-swap. If no row matched, another writer won — retry.
  if (!position) {
    try {
      await prisma.domainCryptoPosition.create({
        data: {
          asset,
          quantity: newQuantity,
          costBasis: newCostBasis,
          averagePrice: newAveragePrice,
          imageUrl: getCryptoLogo(asset),
        },
      })
      return true
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Another writer created the row first; retry against the new state.
        return false
      }
      throw err
    }
  }

  const result = await prisma.domainCryptoPosition.updateMany({
    where: { asset, lastUpdatedAt: position.lastUpdatedAt },
    data: {
      quantity: newQuantity,
      costBasis: newCostBasis,
      averagePrice: newAveragePrice,
      lastUpdatedAt: new Date(),
    },
  })
  return result.count > 0
}

/**
 * Rebuilds all crypto positions from scratch by scanning the entire transaction history.
 * Processes in-memory and flushes once to avoid per-trade transaction overhead.
 */
export async function rebuildAllCryptoPositions() {
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      metadataJson: { not: null },
    },
    orderBy: { occurredAt: "asc" },
  })

  type Position = {
    quantity: Prisma.Decimal
    costBasis: Prisma.Decimal
    averagePrice: Prisma.Decimal
  }
  const positions = new Map<string, Position>()

  for (const tx of transactions) {
    const meta = parseCryptoMetadata(tx.metadataJson)
    if (!meta) continue

    const quantity = new Prisma.Decimal(tx.amount).abs()
    const current = positions.get(meta.asset) ?? {
      quantity: ZERO,
      costBasis: ZERO,
      averagePrice: ZERO,
    }

    if (tx.direction === DomainTransactionDirection.INFLOW) {
      const q = current.quantity.plus(quantity)
      const cb = current.costBasis.plus(quantity.mul(meta.price))
      positions.set(meta.asset, {
        quantity: q,
        costBasis: cb,
        averagePrice: q.greaterThan(0) ? cb.div(q) : ZERO,
      })
    } else if (tx.direction === DomainTransactionDirection.OUTFLOW) {
      const quantityToRemove = Prisma.Decimal.min(current.quantity, quantity)
      const costToRemove = current.averagePrice.mul(quantityToRemove)
      positions.set(meta.asset, {
        quantity: Prisma.Decimal.max(ZERO, current.quantity.minus(quantity)),
        costBasis: Prisma.Decimal.max(ZERO, current.costBasis.minus(costToRemove)),
        averagePrice: current.averagePrice,
      })
    }
  }

  await prisma.$transaction([
    prisma.domainCryptoPosition.deleteMany(),
    ...Array.from(positions.entries()).map(([asset, pos]) =>
      prisma.domainCryptoPosition.create({
        data: {
          asset,
          quantity: pos.quantity,
          costBasis: pos.costBasis,
          averagePrice: pos.averagePrice,
          imageUrl: getCryptoLogo(asset),
        },
      }),
    ),
  ])
}
