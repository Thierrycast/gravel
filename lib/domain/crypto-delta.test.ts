import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  DomainTransaction,
  DomainTransactionDirection,
  Prisma,
} from "@prisma/client"

const findUniqueMock = vi.fn()
const createMock = vi.fn()
const updateManyMock = vi.fn()
const deleteManyMock = vi.fn()
const findManyTxMock = vi.fn()
const txMock = vi.fn(async (ops: unknown[]) => ops)

vi.mock("@/lib/prisma", () => ({
  prisma: {
    domainCryptoPosition: {
      findUnique: (args: unknown) => findUniqueMock(args),
      create: (args: unknown) => createMock(args),
      updateMany: (args: unknown) => updateManyMock(args),
      deleteMany: (args: unknown) => deleteManyMock(args),
    },
    domainTransaction: {
      findMany: (args: unknown) => findManyTxMock(args),
    },
    $transaction: (ops: unknown[]) => txMock(ops),
  },
}))

import { applyCryptoTransactionDelta, rebuildAllCryptoPositions } from "./crypto-delta"

function makeTx(overrides: Partial<DomainTransaction> = {}): DomainTransaction {
  return {
    id: "tx-1",
    occurredAt: new Date("2026-04-10T00:00:00Z"),
    description: null,
    normalizedDescription: null,
    amount: new Prisma.Decimal(1),
    currencyCode: null,
    direction: DomainTransactionDirection.INFLOW,
    sourceProvider: "PLUGGY" as never,
    sourceExternalId: "ext-1",
    sourceParentId: null,
    domainAccountId: null,
    domainMerchantId: null,
    domainCategoryId: null,
    providerCategoryId: null,
    merchantName: null,
    merchantCnpj: null,
    ignored: false,
    metadataJson: JSON.stringify({ baseAsset: "BTC", price: 100 }),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as DomainTransaction
}

describe("applyCryptoTransactionDelta", () => {
  beforeEach(() => {
    findUniqueMock.mockReset()
    createMock.mockReset()
    updateManyMock.mockReset()
  })

  it("creates the position on the first INFLOW with correct quantity/cost/averagePrice", async () => {
    findUniqueMock.mockResolvedValue(null)
    createMock.mockResolvedValue({})

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(2),
        direction: DomainTransactionDirection.INFLOW,
        metadataJson: JSON.stringify({ baseAsset: "BTC", price: 100 }),
      }),
    )

    const args = createMock.mock.calls[0][0] as {
      data: { asset: string; quantity: Prisma.Decimal; costBasis: Prisma.Decimal; averagePrice: Prisma.Decimal }
    }
    expect(args.data.asset).toBe("BTC")
    expect(args.data.quantity.toString()).toBe("2")
    expect(args.data.costBasis.toString()).toBe("200")
    expect(args.data.averagePrice.toString()).toBe("100")
  })

  it("updates the weighted average on a subsequent BUY", async () => {
    findUniqueMock.mockResolvedValue({
      asset: "BTC",
      quantity: new Prisma.Decimal(2),
      costBasis: new Prisma.Decimal(200),
      averagePrice: new Prisma.Decimal(100),
      lastUpdatedAt: new Date("2026-04-01"),
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(2),
        direction: DomainTransactionDirection.INFLOW,
        metadataJson: JSON.stringify({ baseAsset: "BTC", price: 300 }),
      }),
    )

    const args = updateManyMock.mock.calls[0][0] as {
      data: { quantity: Prisma.Decimal; costBasis: Prisma.Decimal; averagePrice: Prisma.Decimal }
    }
    expect(args.data.quantity.toString()).toBe("4")
    expect(args.data.costBasis.toString()).toBe("800") // 200 + 2*300
    expect(args.data.averagePrice.toString()).toBe("200") // 800 / 4
  })

  it("keeps average price on SELL and reduces cost proportionally", async () => {
    findUniqueMock.mockResolvedValue({
      asset: "BTC",
      quantity: new Prisma.Decimal(4),
      costBasis: new Prisma.Decimal(800),
      averagePrice: new Prisma.Decimal(200),
      lastUpdatedAt: new Date("2026-04-01"),
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(1),
        direction: DomainTransactionDirection.OUTFLOW,
        metadataJson: JSON.stringify({ baseAsset: "BTC", price: 500 }),
      }),
    )

    const args = updateManyMock.mock.calls[0][0] as {
      data: { quantity: Prisma.Decimal; costBasis: Prisma.Decimal; averagePrice: Prisma.Decimal }
    }
    expect(args.data.quantity.toString()).toBe("3")
    expect(args.data.costBasis.toString()).toBe("600") // 800 - 1*200
    expect(args.data.averagePrice.toString()).toBe("200") // unchanged
  })

  it("uses CAS — retries when updateMany returns count=0 (stale read)", async () => {
    const stalePos = {
      asset: "BTC",
      quantity: new Prisma.Decimal(1),
      costBasis: new Prisma.Decimal(100),
      averagePrice: new Prisma.Decimal(100),
      lastUpdatedAt: new Date("2026-04-01"),
    }
    const freshPos = { ...stalePos, lastUpdatedAt: new Date("2026-04-02") }
    findUniqueMock.mockResolvedValueOnce(stalePos).mockResolvedValueOnce(freshPos)
    updateManyMock.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(1),
        direction: DomainTransactionDirection.INFLOW,
        metadataJson: JSON.stringify({ baseAsset: "BTC", price: 100 }),
      }),
    )

    expect(findUniqueMock).toHaveBeenCalledTimes(2)
    expect(updateManyMock).toHaveBeenCalledTimes(2)
  })

  it("warns on oversell (sell quantity > held position)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    findUniqueMock.mockResolvedValue({
      asset: "BTC",
      quantity: new Prisma.Decimal(1),
      costBasis: new Prisma.Decimal(100),
      averagePrice: new Prisma.Decimal(100),
      lastUpdatedAt: new Date("2026-04-01"),
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(5),
        direction: DomainTransactionDirection.OUTFLOW,
      }),
    )

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Oversell anomaly"),
      expect.objectContaining({ asset: "BTC" }),
    )
    warn.mockRestore()
  })

  it("warns when first-ever event is OUTFLOW", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    findUniqueMock.mockResolvedValue(null)
    createMock.mockResolvedValue({})

    await applyCryptoTransactionDelta(
      makeTx({
        amount: new Prisma.Decimal(1),
        direction: DomainTransactionDirection.OUTFLOW,
      }),
    )

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("First event is OUTFLOW"),
      expect.objectContaining({ asset: "BTC" }),
    )
    warn.mockRestore()
  })

  it("silently skips when metadataJson is malformed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(
      applyCryptoTransactionDelta(
        makeTx({ metadataJson: "{not valid json" }),
      ),
    ).resolves.toBeUndefined()

    expect(findUniqueMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Malformed metadataJson"),
      expect.anything(),
    )
    warn.mockRestore()
  })

  it("skips ignored transactions", async () => {
    await applyCryptoTransactionDelta(makeTx({ ignored: true }))
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it("skips transactions whose metadata has no asset info", async () => {
    await applyCryptoTransactionDelta(
      makeTx({ metadataJson: JSON.stringify({ providerCode: "X" }) }),
    )
    expect(findUniqueMock).not.toHaveBeenCalled()
  })
})

describe("rebuildAllCryptoPositions", () => {
  beforeEach(() => {
    findManyTxMock.mockReset()
    txMock.mockClear()
  })

  it("aggregates in memory and flushes in a single $transaction", async () => {
    findManyTxMock.mockResolvedValue([
      {
        ...makeTx({
          amount: new Prisma.Decimal(2),
          direction: DomainTransactionDirection.INFLOW,
          metadataJson: JSON.stringify({ baseAsset: "BTC", price: 100 }),
        }),
      },
      {
        ...makeTx({
          amount: new Prisma.Decimal(1),
          direction: DomainTransactionDirection.OUTFLOW,
          metadataJson: JSON.stringify({ baseAsset: "BTC", price: 200 }),
        }),
      },
      {
        ...makeTx({
          amount: new Prisma.Decimal(3),
          direction: DomainTransactionDirection.INFLOW,
          metadataJson: JSON.stringify({ baseAsset: "ETH", price: 50 }),
        }),
      },
    ])

    await rebuildAllCryptoPositions()

    expect(txMock).toHaveBeenCalledTimes(1)
    // Per-delta applyCryptoTransactionDelta must not be called — batch path only.
    expect(findUniqueMock).not.toHaveBeenCalled()
    expect(updateManyMock).not.toHaveBeenCalled()
  })
})
