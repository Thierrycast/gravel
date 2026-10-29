import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { matchPayablesToOutflows } from "@/lib/domain/payables"

const due = new Date(2026, 10, 10)

describe("matchPayablesToOutflows", () => {
  it("liga a saída de mesmo valor perto do vencimento", () => {
    const matches = matchPayablesToOutflows(
      [{ id: "p1", amount: 1234.56, dueDate: due }],
      [
        { id: "outro-valor", amount: -1234.5, occurredAt: new Date(2026, 10, 9) },
        { id: "pago", amount: -1234.56, occurredAt: new Date(2026, 10, 8) },
      ],
    )
    expect(matches).toEqual([{ payableId: "p1", transactionId: "pago", paidAt: new Date(2026, 10, 8) }])
  })

  it("ignora saída fora da janela (pagamento de outro mês)", () => {
    const matches = matchPayablesToOutflows(
      [{ id: "p1", amount: 500, dueDate: due }],
      [{ id: "mes-passado", amount: -500, occurredAt: new Date(2026, 9, 10) }],
    )
    expect(matches).toEqual([])
  })

  it("não reaproveita transação já ligada a outra conta", () => {
    const matches = matchPayablesToOutflows(
      [{ id: "p1", amount: 500, dueDate: due }],
      [{ id: "t1", amount: -500, occurredAt: due }],
      new Set(["t1"]),
    )
    expect(matches).toEqual([])
  })

  it("duas contas de mesmo valor: cada uma fica com a saída mais próxima do próprio vencimento", () => {
    const matches = matchPayablesToOutflows(
      [
        { id: "novembro", amount: 300, dueDate: due },
        { id: "outubro", amount: 300, dueDate: new Date(2026, 9, 28) },
      ],
      [
        { id: "pag-out", amount: -300, occurredAt: new Date(2026, 9, 27) },
        { id: "pag-nov", amount: -300, occurredAt: new Date(2026, 10, 10) },
      ],
    )
    expect(matches.map((m) => [m.payableId, m.transactionId]).sort()).toEqual([
      ["novembro", "pag-nov"],
      ["outubro", "pag-out"],
    ])
  })
})
