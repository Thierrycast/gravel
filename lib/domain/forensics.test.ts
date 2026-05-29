import { describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import {
  BENFORD_IDEAL,
  computeBenfordDistribution,
  findHiddenSubscriptions,
} from "./forensics"

describe("computeBenfordDistribution", () => {
  it("retorna distribuição zerada para dataset vazio", () => {
    const result = computeBenfordDistribution([])
    expect(result.actual).toEqual(Array(9).fill(0))
    expect(result.ideal).toEqual(BENFORD_IDEAL)
    expect(result.sampleSize).toBe(0)
    // Tudo abaixo do threshold em relação ao ideal — todos anômalos quando vazio
    expect(result.anomalies.some(Boolean)).toBe(true)
  })

  it("ignora valores nulos, NaN e zero", () => {
    const result = computeBenfordDistribution([
      null,
      undefined,
      0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "abc",
    ])
    expect(result.sampleSize).toBe(0)
    expect(result.actual).toEqual(Array(9).fill(0))
  })

  it("calcula percentuais a partir de valores reais", () => {
    // 5 valores começando com 1, 3 com 2, 2 com 9 → total 10
    const sample = [
      100, 150, 1234, 18, 1.5,
      200, 250, 2.4,
      900, 99,
    ]
    const result = computeBenfordDistribution(sample)
    expect(result.sampleSize).toBe(10)
    expect(result.actual[0]).toBeCloseTo(50, 5) // 5/10 dígito 1
    expect(result.actual[1]).toBeCloseTo(30, 5) // 3/10 dígito 2
    expect(result.actual[8]).toBeCloseTo(20, 5) // 2/10 dígito 9
  })

  it("aceita valores negativos usando o módulo", () => {
    const result = computeBenfordDistribution([-12, -25, -3])
    // Dígitos primários: 1, 2, 3 → cada um 33.33%
    expect(result.actual[0]).toBeCloseTo(33.333, 2)
    expect(result.actual[1]).toBeCloseTo(33.333, 2)
    expect(result.actual[2]).toBeCloseTo(33.333, 2)
  })

  it("normaliza decimais (0.0123 → dígito 1)", () => {
    const result = computeBenfordDistribution([0.0123, 0.04, 0.0005])
    expect(result.actual[0]).toBeCloseTo(33.333, 2) // 1
    expect(result.actual[3]).toBeCloseTo(33.333, 2) // 4
    expect(result.actual[4]).toBeCloseTo(33.333, 2) // 5
  })

  it("trata strings de Decimal como input válido", () => {
    const result = computeBenfordDistribution(["123.45", "234.56"])
    expect(result.sampleSize).toBe(2)
    expect(result.actual[0]).toBeCloseTo(50, 5)
    expect(result.actual[1]).toBeCloseTo(50, 5)
  })

  it("marca anomalia quando desvio do ideal supera 5 pp", () => {
    // 100% no dígito 1 → desvio gigante
    const result = computeBenfordDistribution([1, 10, 100, 1000])
    expect(result.actual[0]).toBe(100)
    expect(result.anomalies[0]).toBe(true)
  })
})

function tx(over: {
  date: string
  amount: number
  merchant?: string | null
  description?: string | null
}) {
  return {
    occurredAt: new Date(over.date),
    amount: new Prisma.Decimal(over.amount),
    merchantName: over.merchant ?? null,
    description: over.description ?? null,
  }
}

describe("findHiddenSubscriptions", () => {
  it("retorna vazio quando o dataset é vazio", () => {
    expect(findHiddenSubscriptions([])).toEqual([])
  })

  it("ignora grupos com menos de 3 transações", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -29.9, merchant: "Netflix" }),
      tx({ date: "2026-02-10", amount: -29.9, merchant: "Netflix" }),
    ])
    expect(result).toEqual([])
  })

  it("detecta cobrança mensal com pequena variação de valor", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -29.9, merchant: "Spotify" }),
      tx({ date: "2026-02-10", amount: -29.9, merchant: "Spotify" }),
      tx({ date: "2026-03-10", amount: -34.9, merchant: "Spotify" }),
      tx({ date: "2026-04-10", amount: -34.9, merchant: "Spotify" }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Spotify")
    expect(result[0].occurrences).toBe(4)
    expect(result[0].avgGap).toBeGreaterThanOrEqual(27)
    expect(result[0].avgGap).toBeLessThanOrEqual(33)
  })

  it("descarta recorrências sem variação de valor (mensalidade fixa)", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -29.9, merchant: "Aluguel" }),
      tx({ date: "2026-02-10", amount: -29.9, merchant: "Aluguel" }),
      tx({ date: "2026-03-10", amount: -29.9, merchant: "Aluguel" }),
      tx({ date: "2026-04-10", amount: -29.9, merchant: "Aluguel" }),
    ])
    expect(result).toEqual([])
  })

  it("descarta cobranças irregulares fora da janela 27-33 dias", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -10, merchant: "X" }),
      tx({ date: "2026-01-20", amount: -12, merchant: "X" }),
      tx({ date: "2026-02-15", amount: -14, merchant: "X" }),
    ])
    expect(result).toEqual([])
  })

  it("usa description quando merchantName é nulo", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -10, description: "Plano Premium" }),
      tx({ date: "2026-02-10", amount: -11, description: "Plano Premium" }),
      tx({ date: "2026-03-10", amount: -12, description: "Plano Premium" }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Plano Premium")
  })

  it("ignora transações sem merchant nem description", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -10 }),
      tx({ date: "2026-02-10", amount: -11 }),
      tx({ date: "2026-03-10", amount: -12 }),
    ])
    expect(result).toEqual([])
  })

  it("não confia em ordenação prévia de input", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-03-10", amount: -34.9, merchant: "Spotify" }),
      tx({ date: "2026-01-10", amount: -29.9, merchant: "Spotify" }),
      tx({ date: "2026-02-10", amount: -29.9, merchant: "Spotify" }),
      tx({ date: "2026-04-10", amount: -34.9, merchant: "Spotify" }),
    ])
    expect(result).toHaveLength(1)
  })

  it("exclui Pix enviado recorrente da triagem de assinatura", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -1780, description: "Pix enviado - Thierry Barreto De Castro" }),
      tx({ date: "2026-02-10", amount: -1782.33, description: "Pix enviado - Thierry Barreto De Castro" }),
      tx({ date: "2026-03-10", amount: -1784, description: "Pix enviado - Thierry Barreto De Castro" }),
    ])
    expect(result).toEqual([])
  })

  it("exclui pagamento de fatura recorrente da triagem de assinatura", () => {
    const result = findHiddenSubscriptions([
      tx({ date: "2026-01-10", amount: -1770, description: "Pagamento de fatura" }),
      tx({ date: "2026-02-10", amount: -1776.81, description: "Pagamento de fatura" }),
      tx({ date: "2026-03-10", amount: -1778, description: "Pagamento de fatura" }),
    ])
    expect(result).toEqual([])
  })
})
