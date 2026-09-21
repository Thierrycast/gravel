import { describe, expect, it } from "vitest"

import { isGenericIncomeLabel } from "./salary"

describe("isGenericIncomeLabel", () => {
  it.each([
    "Pix Recebido",
    "PIX RECEBIDO",
    "Transferência recebida",
    "TED Recebida",
    "Depósito em conta",
    "Crédito em conta",
    "Pagamento recebido",
  ])("reconhece rótulo genérico: %s", (texto) => {
    // Estes agrupavam depósitos sem relação nenhuma e faziam a Inbox anunciar
    // "possível salário" sobre dinheiro aleatório.
    expect(isGenericIncomeLabel(texto)).toBe(true)
  })

  it.each([
    "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
    "EMPRESA X LTDA",
    "SALARIO ACME",
    "Pix recebido de MARIA SOUZA",
  ])("não trata como genérico quando há origem: %s", (texto) => {
    expect(isGenericIncomeLabel(texto)).toBe(false)
  })

  it("texto vazio é genérico — não agrupa nada", () => {
    expect(isGenericIncomeLabel("")).toBe(true)
    expect(isGenericIncomeLabel(null)).toBe(true)
    expect(isGenericIncomeLabel(undefined)).toBe(true)
    expect(isGenericIncomeLabel("   ")).toBe(true)
  })

  it("ignora acento e pontuação na comparação", () => {
    expect(isGenericIncomeLabel("DEPOSITO")).toBe(true)
    expect(isGenericIncomeLabel("Depósito")).toBe(true)
    expect(isGenericIncomeLabel("deposito.")).toBe(true)
  })
})
