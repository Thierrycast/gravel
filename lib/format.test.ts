import { describe, expect, it } from "vitest"

import {
  amountToneClass,
  daysUntil,
  daysUntilLabel,
  formatCurrency,
  formatCurrencyByCode,
  formatCurrencyCompact,
  formatCurrencySmart,
  formatDate,
  formatDateFull,
  formatDateTime,
  formatDelta,
  formatMonth,
  formatMonthYearLabel,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
} from "./format"

const NBSP = " "

describe("formatCurrency", () => {
  it("renderiza zero como R$ 0,00", () => {
    expect(formatCurrency(0)).toBe(`R$${NBSP}0,00`)
  })

  it("trata null e undefined como zero (não quebra)", () => {
    expect(formatCurrency(null)).toBe(`R$${NBSP}0,00`)
    expect(formatCurrency(undefined)).toBe(`R$${NBSP}0,00`)
  })

  it("normaliza -0 (IEEE 754) para 0 sem sinal de menos", () => {
    expect(formatCurrency(-0)).toBe(`R$${NBSP}0,00`)
  })

  it("normaliza centavos residuais que seriam exibidos como zero", () => {
    expect(formatCurrency(-0.0031)).toBe(`R$${NBSP}0,00`)
    expect(formatCurrency(0.0028)).toBe(`R$${NBSP}0,00`)
  })

  it("formata trilhões sem perder precisão de centavos", () => {
    const out = formatCurrency(1_234_567_890_123.45)
    expect(out.startsWith("R$")).toBe(true)
    expect(out).toContain(",45")
  })

  it("aceita valores negativos", () => {
    expect(formatCurrency(-1234.5)).toContain("1.234,50")
  })
})

describe("formatCurrencyByCode", () => {
  it("default em BRL quando código vazio", () => {
    expect(formatCurrencyByCode(10, undefined)).toContain("R$")
    expect(formatCurrencyByCode(10, "")).toContain("R$")
  })

  it("normaliza apelidos comuns (R$/REAL → BRL, DOLAR → USD)", () => {
    expect(formatCurrencyByCode(10, "R$")).toContain("R$")
    expect(formatCurrencyByCode(10, "real")).toContain("R$")
    expect(formatCurrencyByCode(10, "dolar")).toContain("US$")
  })

  it("usa fallback quando código é inválido para Intl", () => {
    const out = formatCurrencyByCode(10, "INVALIDO")
    expect(out).toContain("INVALIDO")
  })

  it("trata null/undefined como zero", () => {
    expect(formatCurrencyByCode(null, "BRL")).toContain("0,00")
    expect(formatCurrencyByCode(undefined, "USD")).toContain("0.00")
  })

  it("não expõe sinal negativo em resíduo arredondado para zero", () => {
    expect(formatCurrencyByCode(-0.0031, "BRL")).toBe(`R$${NBSP}0,00`)
  })
})

describe("formatSignedCurrency", () => {
  it("usa menos tipográfico para negativos", () => {
    expect(formatSignedCurrency(-1)).toContain("−")
  })

  it("modo always sempre prefixa positivos com +", () => {
    expect(formatSignedCurrency(1, "always")).toContain("+")
  })

  it("modo signed não adiciona + para zero", () => {
    expect(formatSignedCurrency(0, "signed")).not.toContain("+")
    expect(formatSignedCurrency(0, "always")).not.toContain("+")
  })

  it("modo none não prefixa positivos", () => {
    expect(formatSignedCurrency(10, "none")).not.toContain("+")
    expect(formatSignedCurrency(10, "none")).not.toContain("−")
  })

  it("trata null/undefined como zero", () => {
    expect(formatSignedCurrency(null)).toBe(`R$${NBSP}0,00`)
    expect(formatSignedCurrency(undefined, "always")).toBe(`R$${NBSP}0,00`)
  })

  it("não sinaliza resíduos monetários abaixo de meio centavo", () => {
    expect(formatSignedCurrency(-0.0031, "always")).toBe(`R$${NBSP}0,00`)
  })

  it("delta sempre indica polaridade exceto zero", () => {
    expect(formatDelta(5)).toContain("+")
    expect(formatDelta(-5)).toContain("−")
    expect(formatDelta(0)).not.toContain("+")
  })
})

describe("formatCurrencyCompact / Smart", () => {
  it("compact lida com null", () => {
    expect(formatCurrencyCompact(null)).toContain("R$")
  })

  it("smart muda para compact acima de 100k", () => {
    const small = formatCurrencySmart(50_000)
    const big = formatCurrencySmart(150_000)
    expect(small).toContain("50.000,00")
    expect(big.length).toBeLessThan(small.length)
  })
})

describe("formatNumber e formatPercent", () => {
  it("number trata null/undefined", () => {
    expect(formatNumber(null)).toBe("0")
    expect(formatNumber(undefined)).toBe("0")
  })

  it("percent espera 0–100", () => {
    expect(formatPercent(50)).toContain("50,0%")
  })

  it("percent assinado prefixa polaridade", () => {
    expect(formatSignedPercent(10)).toContain("+")
    expect(formatSignedPercent(-10)).toContain("−")
    expect(formatSignedPercent(0)).not.toContain("+")
    expect(formatSignedPercent(null)).not.toContain("−")
  })
})

describe("formatadores de data", () => {
  it("retornam 'Sem data' para entradas inválidas", () => {
    expect(formatDate(null)).toBe("Sem data")
    expect(formatDate(undefined)).toBe("Sem data")
    expect(formatDate("invalida")).toBe("Sem data")
    expect(formatDateFull(null)).toBe("Sem data")
    expect(formatDateTime(null)).toBe("Sem data")
    expect(formatMonth(undefined)).toBe("Sem data")
    expect(formatMonthYearLabel(null)).toBe("Sem data")
  })

  it("aceitam Date e string ISO", () => {
    const iso = "2026-05-09T10:00:00.000Z"
    expect(formatDate(iso)).toMatch(/\d{2}/)
    expect(formatDate(new Date(iso))).toMatch(/\d{2}/)
  })

  it("formatMonthYearLabel capitaliza quando solicitado", () => {
    const label = formatMonthYearLabel("2026-03-15", { capitalize: true })
    expect(label[0]).toBe(label[0].toUpperCase())
  })
})

describe("daysUntil / daysUntilLabel", () => {
  it("retorna NaN para entradas inválidas", () => {
    expect(daysUntil(null)).toBeNaN()
    expect(daysUntil("xyz")).toBeNaN()
    expect(daysUntilLabel(null)).toBe("Sem data")
  })

  it("aplica rótulos relativos comuns", () => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    expect(daysUntilLabel(today)).toBe("Hoje")
    expect(daysUntilLabel(tomorrow)).toBe("Amanhã")
    expect(daysUntilLabel(yesterday)).toBe("Ontem")
  })
})

describe("amountToneClass", () => {
  it("positivo usa emerald, negativo usa rose", () => {
    expect(amountToneClass(10)).toContain("emerald")
    expect(amountToneClass(-10)).toContain("rose")
  })

  it("zero é foreground por padrão", () => {
    expect(amountToneClass(0)).toContain("text-foreground")
  })

  it("neutralOnZero retorna foreground em zero", () => {
    expect(amountToneClass(0, { neutralOnZero: true })).toContain("text-foreground")
  })

  it("reverse inverte semântica (gastos como positivo)", () => {
    expect(amountToneClass(10, { reverse: true })).toContain("rose")
    expect(amountToneClass(-10, { reverse: true })).toContain("emerald")
  })

  it("trata null/undefined como zero", () => {
    expect(amountToneClass(null)).toContain("text-foreground")
    expect(amountToneClass(undefined)).toContain("text-foreground")
  })
})
