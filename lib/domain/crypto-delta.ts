import { DomainTransaction, DomainTransactionDirection, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const ZERO = new Prisma.Decimal(0)

/**
 * Updates the materialized crypto position for a given asset based on a new transaction.
 * This implements the "Delta-Based" processing strategy (Pillar 3 of Performance Optimization).
 */
export async function applyCryptoTransactionDelta(transaction: DomainTransaction) {
  // Only process crypto transactions that are not ignored
  if (transaction.ignored || !transaction.metadataJson) return

  const metadata = JSON.parse(transaction.metadataJson)
  const asset = metadata.baseAsset || metadata.asset
  if (!asset) return

  // We use a transaction to ensure atomic updates to the position state
  await prisma.$transaction(async (tx) => {
    // 1. Get current position state (or create initial if not exists)
    let position = await tx.domainCryptoPosition.findUnique({
      where: { asset },
    })

    if (!position) {
      position = await tx.domainCryptoPosition.create({
        data: {
          asset,
          quantity: ZERO,
          costBasis: ZERO,
          averagePrice: ZERO,
        },
      })
    }

    // 2. Parse trade data from metadata
    const quantity = new Prisma.Decimal(transaction.amount).abs()
    const price = new Prisma.Decimal(metadata.price || 0)
    const direction = transaction.direction

    let newQuantity = new Prisma.Decimal(position.quantity)
    let newCostBasis = new Prisma.Decimal(position.costBasis)
    let newAveragePrice = new Prisma.Decimal(position.averagePrice)

    if (direction === DomainTransactionDirection.INFLOW) {
      // BUY: Increase quantity and cost basis
      newQuantity = newQuantity.plus(quantity)
      newCostBasis = newCostBasis.plus(quantity.mul(price))
      
      if (newQuantity.greaterThan(0)) {
        newAveragePrice = newCostBasis.div(newQuantity)
      }
    } else if (direction === DomainTransactionDirection.OUTFLOW) {
      // SELL: Decrease quantity. Cost basis is reduced by the proportion of the average price.
      // Realized PnL could be tracked here too in the future.
      const quantityToRemove = Prisma.Decimal.min(newQuantity, quantity)
      const costToRemove = newAveragePrice.mul(quantityToRemove)
      
      newQuantity = Prisma.Decimal.max(ZERO, newQuantity.minus(quantity))
      newCostBasis = Prisma.Decimal.max(ZERO, newCostBasis.minus(costToRemove))
      
      // Average price stays the same during a sell (cost per unit doesn't change)
    }

    // 3. Update the materialized state
    await tx.domainCryptoPosition.update({
      where: { asset },
      data: {
        quantity: newQuantity,
        costBasis: newCostBasis,
        averagePrice: newAveragePrice,
        lastUpdatedAt: new Date(),
      },
    })
  })
}

/**
 * Rebuilds all crypto positions from scratch by scanning the entire transaction history.
 * Useful for migrations or if data gets out of sync.
 */
export async function rebuildAllCryptoPositions() {
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      ignored: false,
      // Metadata check is a proxy for "is this a crypto/investment trade"
      metadataJson: { not: null },
    },
    orderBy: { occurredAt: "asc" },
  })

  // Clear existing positions
  await prisma.domainCryptoPosition.deleteMany()

  for (const tx of transactions) {
    // Only process if it looks like a crypto trade (has asset info in metadata)
    const meta = JSON.parse(tx.metadataJson!)
    if (meta.baseAsset || meta.asset) {
      await applyCryptoTransactionDelta(tx)
    }
  }
}
