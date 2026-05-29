import { describe, expect, it } from "vitest"
import { DomainCategoryKind, DomainTransactionDirection, Prisma } from "@prisma/client"

import {
  detectExplicitInstallment,
  inferInstallmentGroups,
  selectCanonicalInstallmentCategoryId,
  stripInstallmentMarker,
} from "./installments"

function makeTransaction(overrides: Partial<Parameters<typeof inferInstallmentGroups>[0][number]>) {
  return {
    id: overrides.id ?? "tx",
    occurredAt: overrides.occurredAt ?? new Date("2026-01-10T00:00:00.000Z"),
    description: overrides.description ?? "LOJA 1/3",
    normalizedDescription: overrides.normalizedDescription ?? null,
    amount: overrides.amount ?? new Prisma.Decimal("-100"),
    direction: overrides.direction ?? DomainTransactionDirection.OUTFLOW,
    domainAccountId: overrides.domainAccountId ?? "acc-1",
    domainCategoryId: overrides.domainCategoryId ?? "cat-1",
    domainMerchantId: overrides.domainMerchantId ?? "merchant-1",
    merchantName: overrides.merchantName ?? "Loja",
  }
}

describe("installments", () => {
  it("detecta parcela explicita N/T", () => {
    expect(detectExplicitInstallment("Compra mercado 2/10")).toEqual({
      current: 2,
      total: 10,
    })
  })

  it("remove marcador de parcela da chave de descricao", () => {
    expect(stripInstallmentMarker("Compra mercado 2/10")).toBe("compra mercado")
  })

  it("agrupa duas parcelas em meses consecutivos por similaridade conservadora", () => {
    const groups = inferInstallmentGroups([
      makeTransaction({
        id: "tx-1",
        description: "Loja ABC",
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-2",
        description: "Loja ABC",
        occurredAt: new Date("2026-02-10T00:00:00.000Z"),
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.totalInstallments).toBe(2)
    expect(groups[0]?.source).toBe("similarity")
  })

  it("nao agrupa valores diferentes por similaridade", () => {
    const groups = inferInstallmentGroups([
      makeTransaction({
        id: "tx-1",
        description: "Loja ABC",
        amount: new Prisma.Decimal("-100"),
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-2",
        description: "Loja ABC",
        amount: new Prisma.Decimal("-120"),
        occurredAt: new Date("2026-02-10T00:00:00.000Z"),
      }),
    ])

    expect(groups).toHaveLength(0)
  })

  it("nao classifica assinatura recorrente longa como parcelamento por similaridade", () => {
    const groups = inferInstallmentGroups([
      makeTransaction({
        id: "tx-1",
        description: "Streaming ABC",
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-2",
        description: "Streaming ABC",
        occurredAt: new Date("2026-02-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-3",
        description: "Streaming ABC",
        occurredAt: new Date("2026-03-10T00:00:00.000Z"),
      }),
    ])

    expect(groups).toHaveLength(0)
  })

  it("agrupa parcelas explicitas mesmo quando a categoria e centavos divergem", () => {
    const groups = inferInstallmentGroups([
      makeTransaction({
        id: "tx-1",
        description: "Amazon Prime 1/3",
        normalizedDescription: "amazon prime 1 3",
        amount: new Prisma.Decimal("-115.70"),
        domainCategoryId: "cat-books",
        occurredAt: new Date("2026-01-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-2",
        description: "Amazon Prime 2/3",
        normalizedDescription: "amazon prime 2 3",
        amount: new Prisma.Decimal("-115.69"),
        domainCategoryId: "cat-streaming",
        occurredAt: new Date("2026-02-10T00:00:00.000Z"),
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.totalInstallments).toBe(3)
    expect(groups[0]?.source).toBe("explicit")
  })

  it("separa novo ciclo quando a numeracao explicita reinicia", () => {
    const groups = inferInstallmentGroups([
      makeTransaction({
        id: "tx-1",
        description: "Amazon Prime 11/12",
        occurredAt: new Date("2026-03-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-2",
        description: "Amazon Prime 12/12",
        occurredAt: new Date("2026-04-10T00:00:00.000Z"),
      }),
      makeTransaction({
        id: "tx-3",
        description: "Amazon Prime 1/12",
        occurredAt: new Date("2026-05-10T00:00:00.000Z"),
      }),
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.transactions.length)).toEqual([2, 1])
  })

  it("prefere categoria nao-transferencia ao canonizar parcelas", () => {
    const canonical = selectCanonicalInstallmentCategoryId(
      [
        makeTransaction({ id: "tx-1", domainCategoryId: "cat-transfer" }),
        makeTransaction({ id: "tx-2", domainCategoryId: "cat-shopping" }),
      ],
      new Map([
        ["cat-transfer", DomainCategoryKind.TRANSFER],
        ["cat-shopping", DomainCategoryKind.EXPENSE],
      ]),
    )

    expect(canonical).toBe("cat-shopping")
  })
})
