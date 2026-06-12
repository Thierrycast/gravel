import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

type MockedAggregateArgs = {
  where: {
    domainAccountId: string
    occurredAt: { gte: Date; lte: Date }
    ignored: boolean
  }
}

const aggregateMock = vi.fn()
const findFirstAnchorMock = vi.fn()
const upsertMock = vi.fn()
const findManyTxMock = vi.fn()
const deleteManyAnchorMock = vi.fn()
const createManyAnchorMock = vi.fn()
const txMock = vi.fn(async (ops: unknown[]) => ops)

vi.mock("@/lib/prisma", () => ({
  prisma: {
    domainTransaction: {
      aggregate: (args: MockedAggregateArgs) => aggregateMock(args),
      findMany: (args: unknown) => findManyTxMock(args),
    },
    domainBalanceAnchor: {
      findFirst: (args: unknown) => findFirstAnchorMock(args),
      upsert: (args: unknown) => upsertMock(args),
      deleteMany: (args: unknown) => deleteManyAnchorMock(args),
      createMany: (args: unknown) => createManyAnchorMock(args),
    },
    $transaction: (ops: unknown[]) => txMock(ops),
  },
}))

import { createBalanceAnchor, rebuildAccountAnchors } from "./anchors"

describe("createBalanceAnchor", () => {
  beforeEach(() => {
    aggregateMock.mockReset()
    findFirstAnchorMock.mockReset()
    upsertMock.mockReset()
  })

  it("derives the [gte, lte] window from the (year, month) parameters", async () => {
    findFirstAnchorMock.mockResolvedValue(null)
    aggregateMock.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) }, _count: 0 })
    upsertMock.mockResolvedValue({})

    await createBalanceAnchor("acc-1", 2026, 4)

    const aggArgs = aggregateMock.mock.calls[0][0] as MockedAggregateArgs
    expect(aggArgs.where.occurredAt.gte.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(aggArgs.where.occurredAt.lte.toISOString()).toBe("2026-04-30T23:59:59.999Z")
  })

  it("uses gte (inclusive) so YYYY-MM-01T00:00:00.000Z isn't lost at the boundary", async () => {
    findFirstAnchorMock.mockResolvedValue(null)
    aggregateMock.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(0) }, _count: 0 })
    upsertMock.mockResolvedValue({})

    await createBalanceAnchor("acc-1", 2026, 4)
    const aggArgs = aggregateMock.mock.calls[0][0] as MockedAggregateArgs
    expect(aggArgs.where.occurredAt).toHaveProperty("gte")
    expect(aggArgs.where.occurredAt).not.toHaveProperty("gt")
  })

  it("adds the monthly delta to the previous anchor's balance", async () => {
    findFirstAnchorMock.mockResolvedValue({
      year: 2026,
      month: 3,
      balance: new Prisma.Decimal(1000),
    })
    aggregateMock.mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(250) },
      _count: 3,
    })
    upsertMock.mockResolvedValue({})

    await createBalanceAnchor("acc-1", 2026, 4)

    const upsertArgs = upsertMock.mock.calls[0][0] as {
      create: { balance: Prisma.Decimal; transactionsCount: number }
    }
    expect(upsertArgs.create.balance.toString()).toBe("1250")
    expect(upsertArgs.create.transactionsCount).toBe(3)
  })

  it("treats months with no transactions as a flat carry-over", async () => {
    findFirstAnchorMock.mockResolvedValue({
      year: 2026,
      month: 2,
      balance: new Prisma.Decimal(500),
    })
    aggregateMock.mockResolvedValue({ _sum: { amount: null }, _count: 0 })
    upsertMock.mockResolvedValue({})

    await createBalanceAnchor("acc-1", 2026, 3)

    const upsertArgs = upsertMock.mock.calls[0][0] as {
      create: { balance: Prisma.Decimal }
    }
    expect(upsertArgs.create.balance.toString()).toBe("500")
  })
})

describe("rebuildAccountAnchors", () => {
  beforeEach(() => {
    findManyTxMock.mockReset()
    deleteManyAnchorMock.mockReset()
    createManyAnchorMock.mockReset()
    txMock.mockClear()
  })

  it("returns early when there are no transactions", async () => {
    findManyTxMock.mockResolvedValue([])
    await rebuildAccountAnchors("acc-1")
    expect(txMock).not.toHaveBeenCalled()
  })

  it("produces one anchor row per month between first tx and now, with running balance", async () => {
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"))
    findManyTxMock.mockResolvedValue([
      { occurredAt: new Date("2026-02-10T00:00:00Z"), amount: new Prisma.Decimal(100) },
      { occurredAt: new Date("2026-02-20T00:00:00Z"), amount: new Prisma.Decimal(-30) },
      { occurredAt: new Date("2026-04-01T00:00:00Z"), amount: new Prisma.Decimal(50) },
    ])

    await rebuildAccountAnchors("acc-1")

    const createArgs = createManyAnchorMock.mock.calls[0][0] as {
      data: Array<{ year: number; month: number; balance: Prisma.Decimal; transactionsCount: number }>
    }
    // Feb (delta=70), Mar (no tx → 0 delta, carry 70), Apr (delta=50, total 120).
    expect(createArgs.data.map((record) => `${record.year}-${record.month}`)).toEqual([
      "2026-2",
      "2026-3",
      "2026-4",
    ])
    expect(createArgs.data[0].balance.toString()).toBe("70")
    expect(createArgs.data[1].balance.toString()).toBe("70")
    expect(createArgs.data[2].balance.toString()).toBe("120")
    expect(createArgs.data[0].transactionsCount).toBe(2)
    expect(createArgs.data[1].transactionsCount).toBe(0)
    expect(createArgs.data[2].transactionsCount).toBe(1)

    vi.useRealTimers()
  })

  it("includes the current month in the rebuild range", async () => {
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"))
    findManyTxMock.mockResolvedValue([
      { occurredAt: new Date("2026-04-10T00:00:00Z"), amount: new Prisma.Decimal(10) },
    ])

    await rebuildAccountAnchors("acc-1")

    const createArgs = createManyAnchorMock.mock.calls[0][0] as {
      data: Array<{ year: number; month: number }>
    }
    expect(createArgs.data.at(-1)).toMatchObject({ year: 2026, month: 4 })
    vi.useRealTimers()
  })
})
