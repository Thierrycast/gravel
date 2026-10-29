import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { descendantIds, summarizeBudget } from "@/lib/domain/budgets"

describe("descendantIds", () => {
  it("inclui a categoria e todas as descendentes, em qualquer profundidade", () => {
    const categories = [
      { id: "food", parentId: null },
      { id: "market", parentId: "food" },
      { id: "restaurant", parentId: "food" },
      { id: "fastfood", parentId: "restaurant" },
      { id: "transport", parentId: null },
    ]
    expect([...descendantIds("food", categories)].sort()).toEqual([
      "fastfood",
      "food",
      "market",
      "restaurant",
    ])
    expect([...descendantIds("transport", categories)]).toEqual(["transport"])
  })
})

describe("summarizeBudget", () => {
  it("dentro do limite e do ritmo: ok", () => {
    const result = summarizeBudget({ monthlyLimit: 1000, alertAtPercent: 80, spent: 300, monthElapsed: 0.5 })
    expect(result).toMatchObject({ status: "ok", percent: 30, remaining: 700, projected: 600, reason: null })
  })

  it("passou do percentual de alerta: warning", () => {
    const result = summarizeBudget({ monthlyLimit: 1000, alertAtPercent: 80, spent: 850, monthElapsed: 0.9 })
    expect(result.status).toBe("warning")
    expect(result.reason).toBe("85% do limite já usado.")
  })

  it("abaixo do alerta, mas o ritmo estoura o mês: warning", () => {
    const result = summarizeBudget({ monthlyLimit: 1000, alertAtPercent: 80, spent: 600, monthElapsed: 0.4 })
    expect(result).toMatchObject({ status: "warning", projected: 1500 })
    expect(result.reason).toContain("ritmo")
  })

  it("estourou: over, com restante negativo", () => {
    const result = summarizeBudget({ monthlyLimit: 500, alertAtPercent: 80, spent: 620, monthElapsed: 0.7 })
    expect(result).toMatchObject({ status: "over", remaining: -120 })
  })

  it("no começo do mês não projeta: uma compra grande no dia 1 não vira alarme", () => {
    const result = summarizeBudget({ monthlyLimit: 1000, alertAtPercent: 80, spent: 400, monthElapsed: 0.05 })
    expect(result).toMatchObject({ status: "ok", projected: 400 })
  })
})
