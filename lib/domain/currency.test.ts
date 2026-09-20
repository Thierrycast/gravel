import { describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import {
  formatCurrencyByCode,
} from "@/lib/format"

import {
  isBrlCurrency,
  isUsdLikeCurrency,
  normalizeCurrencyCode,
  sumCurrencyDecimals,
  sumConvertedToBrl,
  convertToBrl,
  createBrlConverter,
} from "./currency"

describe("currency helpers", () => {
  it("normaliza codigos comuns de moeda", () => {
    expect(normalizeCurrencyCode(" real ")).toBe("BRL")
    expect(normalizeCurrencyCode("dolar")).toBe("USD")
    expect(normalizeCurrencyCode("usdt")).toBe("USDT")
  })

  it("identifica BRL e USD-like sem misturar as bases", () => {
    expect(isBrlCurrency("BRL")).toBe(true)
    expect(isBrlCurrency("USD")).toBe(false)
    expect(isUsdLikeCurrency("USDT")).toBe(true)
  })

  it("soma apenas a moeda alvo", () => {
    const total = sumCurrencyDecimals(
      [
        { amount: new Prisma.Decimal(100), currencyCode: "BRL" },
        { amount: new Prisma.Decimal(50), currencyCode: "USD" },
        { amount: new Prisma.Decimal(25), currencyCode: null },
      ],
      (row) => row.amount,
      (row) => row.currencyCode,
      "BRL",
    )

    expect(total.toString()).toBe("125")
  })

  it("formata moeda original sem tratar USD como BRL", () => {
    expect(formatCurrencyByCode(10, "USD")).toBe("$10.00")
    expect(formatCurrencyByCode(10, "BRL")).toContain("R$")
  })
})

describe("convertToBrl — uma conversão só, em vez de cinco cópias ad-hoc", () => {
  const RATE = 5

  it("deixa BRL intacto", () => {
    const result = convertToBrl(new Prisma.Decimal(100), "BRL", RATE)
    expect(result.amount.toString()).toBe("100")
    expect(result.unsupportedCurrency).toBeUndefined()
  })

  it("converte USD pela cotação", () => {
    expect(convertToBrl(new Prisma.Decimal(10), "USD", RATE).amount.toString()).toBe("50")
  })

  it("converte stablecoin como dólar — era o buraco do `=== USD`", () => {
    // normalizeCurrencyCode devolve "USDT" inalterado, então a comparação
    // literal com "USD" deixava 1000 USDT serem somados como 1000 BRL.
    for (const code of ["USDT", "USDC", "BUSD"]) {
      expect(convertToBrl(new Prisma.Decimal(1000), code, RATE).amount.toString()).toBe("5000")
    }
  })

  it("NÃO trata euro e libra como dólar", () => {
    // `!isBrlCurrency(x) => multiplica por usdBrlRate` fazia exatamente isso.
    const euro = convertToBrl(new Prisma.Decimal(100), "EUR", RATE)
    expect(euro.amount.toString()).not.toBe("500")
    expect(euro.unsupportedCurrency).toBe("EUR")

    const libra = convertToBrl(new Prisma.Decimal(100), "GBP", RATE)
    expect(libra.unsupportedCurrency).toBe("GBP")
  })

  it("moeda desconhecida não some nem mente: valor preservado e sinalizado", () => {
    // Somar 1:1 seria mentir; descartar seria sumir com dinheiro do usuário.
    // Preserva o número e declara que não converteu, para a UI poder avisar.
    const result = convertToBrl(new Prisma.Decimal(100), "JPY", RATE)
    expect(result.amount.toString()).toBe("100")
    expect(result.converted).toBe(false)
    expect(result.unsupportedCurrency).toBe("JPY")
  })

  it("trata ausência de moeda como BRL", () => {
    expect(convertToBrl(new Prisma.Decimal(7), null, RATE).amount.toString()).toBe("7")
    expect(convertToBrl(new Prisma.Decimal(7), undefined, RATE).unsupportedCurrency).toBeUndefined()
  })
})

describe("createBrlConverter — acumula o que não soube converter", () => {
  it("soma o que sabe e lista o que não sabe", () => {
    const toBrl = createBrlConverter(5)

    expect(toBrl(new Prisma.Decimal(10), "USD").toString()).toBe("50")
    expect(toBrl(new Prisma.Decimal(10), "BRL").toString()).toBe("10")
    expect(toBrl(new Prisma.Decimal(10), "EUR").toString()).toBe("10")
    expect(toBrl(new Prisma.Decimal(10), "EUR").toString()).toBe("10")
    expect(toBrl(new Prisma.Decimal(10), "JPY").toString()).toBe("10")

    // Sem repetição: é a lista de moedas, não de transações.
    expect([...toBrl.unsupportedCurrencies].sort()).toEqual(["EUR", "JPY"])
  })

  it("começa limpo", () => {
    expect([...createBrlConverter(5).unsupportedCurrencies]).toEqual([])
  })
})

describe("sumConvertedToBrl", () => {
  it("para de somar moeda desconhecida como se fosse BRL", () => {
    const rows = [
      { amount: new Prisma.Decimal(100), currencyCode: "BRL" },
      { amount: new Prisma.Decimal(10), currencyCode: "USD" },
      { amount: new Prisma.Decimal(1000), currencyCode: "USDT" },
    ]
    const total = sumConvertedToBrl(rows, (r) => r.amount, (r) => r.currencyCode, 5)
    // 100 + 50 + 5000
    expect(total.toString()).toBe("5150")
  })
})
