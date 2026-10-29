import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { buildGoalHistorySeries } from "@/lib/domain/queries"

describe("buildGoalHistorySeries", () => {
  it("soma aportes (saídas) e abate resgates (entradas), partindo do valor inicial", () => {
    const series = buildGoalHistorySeries(
      [
        { amount: -300, occurredAt: new Date(2026, 7, 5) },
        { amount: -200, occurredAt: new Date(2026, 8, 5) },
        { amount: 100, occurredAt: new Date(2026, 8, 20) }, // resgate
      ],
      1000,
    )

    expect(series).toEqual([
      { year: 2026, month: 8, label: "2026-08", addedAmount: 300, cumulativeAmount: 1300 },
      { year: 2026, month: 9, label: "2026-09", addedAmount: 100, cumulativeAmount: 1400 },
    ])
  })

  it("sem transações, série vazia", () => {
    expect(buildGoalHistorySeries([], 500)).toEqual([])
  })
})
