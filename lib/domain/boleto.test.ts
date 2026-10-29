import { describe, expect, it } from "vitest"

import { dueDateFromFactor, findBoletoInText, parseBoleto } from "@/lib/domain/boleto"

// Vetores gerados por uma implementação independente (Python) dos algoritmos
// FEBRABAN, com dados fictícios: banco 341, vencimento 10/11/2026, R$ 1.234,56.
const BANK_LINE = "34191234546789012345767890123457916260000123456"
const BANK_BARCODE = "34199162600001234561234567890123456789012345"
const CONV6_LINE = "826100000015234501232024611101234569789012345672"
const CONV6_BARCODE = "82610000001234501232026111012345678901234567"
const CONV8_LINE = "828500000000999001239879654321098762543210987656"

const NOW = new Date(2026, 9, 29)

describe("parseBoleto — bancário", () => {
  it("lê valor, vencimento e banco da linha digitável formatada", () => {
    const formatted = "34191.23454 67890.123457 67890.123457 9 16260000123456"
    const result = parseBoleto(formatted, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.boleto).toMatchObject({
      kind: "BANK",
      barcode: BANK_BARCODE,
      digitableLine: BANK_LINE,
      amount: 1234.56,
      issuer: "341",
    })
    expect(result.boleto.dueDate).toEqual(new Date(2026, 10, 10))
  })

  it("aceita o código de barras e reconstrói a mesma linha", () => {
    const result = parseBoleto(BANK_BARCODE, NOW)
    expect(result.ok && result.boleto.digitableLine).toBe(BANK_LINE)
  })

  it("recusa dígito de campo errado", () => {
    const wrong = BANK_LINE.slice(0, 9) + "0" + BANK_LINE.slice(10)
    expect(parseBoleto(wrong, NOW)).toEqual({ ok: false, error: "Dígito do 1º campo não confere. Confira o código." })
  })

  it("recusa valor adulterado (DV geral)", () => {
    const tampered = BANK_LINE.slice(0, 46) + "7"
    const result = parseBoleto(tampered, NOW)
    expect(result.ok).toBe(false)
  })
})

describe("parseBoleto — convênio", () => {
  it("tipo 6 (módulo 10): valor efetivo, sem vencimento", () => {
    const result = parseBoleto(CONV6_LINE, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.boleto).toMatchObject({ kind: "CONVENIO", barcode: CONV6_BARCODE, amount: 123.45, dueDate: null })
  })

  it("tipo 8 (módulo 11)", () => {
    const result = parseBoleto(CONV8_LINE, NOW)
    expect(result.ok && result.boleto.amount).toBe(99.9)
  })

  it("código de barras de convênio vira a mesma linha", () => {
    const result = parseBoleto(CONV6_BARCODE, NOW)
    expect(result.ok && result.boleto.digitableLine).toBe(CONV6_LINE)
  })

  it("recusa bloco com DV errado", () => {
    const wrong = CONV6_LINE.slice(0, 11) + "9" + CONV6_LINE.slice(12)
    expect(parseBoleto(wrong, NOW).ok).toBe(false)
  })
})

describe("dueDateFromFactor", () => {
  it("usa o ciclo mais próximo de hoje (o fator reiniciou em 22/02/2025)", () => {
    expect(dueDateFromFactor(1000, NOW)).toEqual(new Date(2025, 1, 22))
    // O mesmo fator no ciclo antigo seria 2000; perto de 2000, vale o antigo.
    expect(dueDateFromFactor(1000, new Date(2000, 6, 1))).toEqual(new Date(2000, 6, 3))
  })

  it("fator zero: sem vencimento", () => {
    expect(dueDateFromFactor(0, NOW)).toBeNull()
  })
})

describe("findBoletoInText", () => {
  it("acha a linha digitável no meio do texto de um PDF", () => {
    const text = `Beneficiário: Condomínio Exemplo\nVencimento 10/11/2026\n34191.23454 67890.123457 67890.123457 9 16260000123456\nValor R$ 1.234,56`
    expect(findBoletoInText(text, NOW)?.amount).toBe(1234.56)
  })

  it("ignora números longos que não são boleto", () => {
    expect(findBoletoInText("Protocolo 1234567890 1234567890 1234567890 12345678901234567", NOW)).toBeNull()
  })
})

describe("parseBoleto — tamanho", () => {
  it("explica os tamanhos aceitos", () => {
    const result = parseBoleto("123", NOW)
    expect(result.ok).toBe(false)
  })
})
