import { describe, expect, it } from "vitest"

import { validateCategorizePayload } from "./pluggy"

describe("validateCategorizePayload", () => {
  const base = {
    id: "tx-1",
    amount: 100,
    date: "2026-07-03T00:00:00.000Z",
    description: "Mercado",
  }

  it("keeps valid transactions and rejects malformed ones", () => {
    const { valid, invalid } = validateCategorizePayload([
      base,
      { ...base, id: "", },
      { ...base, id: "tx-3", amount: Number.NaN },
      { ...base, id: "tx-4", date: "not-a-date" },
      { ...base, id: "tx-5", description: "" },
    ])
    expect(valid.map((t) => t.id)).toEqual(["tx-1"])
    expect(invalid).toHaveLength(4)
    expect(invalid.map((i) => i.reason)).toContain("date inválida")
    expect(invalid.map((i) => i.reason)).toContain("amount inválido")
  })

  it("does not throw on an all-invalid batch", () => {
    const { valid, invalid } = validateCategorizePayload([
      { ...base, id: "", },
    ])
    expect(valid).toHaveLength(0)
    expect(invalid).toHaveLength(1)
  })
})
