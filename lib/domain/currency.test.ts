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
