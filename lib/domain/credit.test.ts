import { describe, expect, it } from "vitest"

import { extractCreditData, summarizeCreditLimits } from "./credit"

// Payload real do cartão Nubank dele, recortado do snapshot de 2026-09-07.
// Mantido verbatim de propósito: o teste que importa é contra a forma que a
// Pluggy manda de verdade, não contra a que a gente imagina.
const nubankCreditData = {
  level: "GOLD",
  brand: "MASTERCARD",
  brandAdditionalInfo: "NA",
  balanceCloseDate: null,
  balanceDueDate: "2026-08-10",
  availableCreditLimit: 8328.97,
  balanceForeignCurrency: null,
  minimumPayment: 0,
  creditLimit: 11300,
  isLimitFlexible: false,
  holderType: null,
  status: "ACTIVE",
  disaggregatedCreditLimits: [
    { lineName: "CREDITO_A_VISTA", limitAmount: 11300, identificationNumber: "7208" },
    { lineName: "CREDITO_PARCELADO", limitAmount: 11300, identificationNumber: "7208" },
    { lineName: "CREDITO_A_VISTA", limitAmount: 11300, identificationNumber: "7162" },
    { lineName: "CREDITO_PARCELADO", limitAmount: 11300, identificationNumber: "7162" },
  ],
}

describe("extractCreditData", () => {
  it("lê o limite e o disponível do payload real", () => {
    const data = extractCreditData(nubankCreditData)
    expect(data?.creditLimit).toBe(11300)
    expect(data?.availableCreditLimit).toBe(8328.97)
    expect(data?.brand).toBe("MASTERCARD")
    expect(data?.balanceDueDate).toBe("2026-08-10")
  })

  it("não soma as linhas de disaggregatedCreditLimits", () => {
    // Quatro linhas de 11.300 no payload; o limite do cartão é 11.300, uma vez.
    const data = extractCreditData(nubankCreditData)
    expect(data?.creditLimit).toBe(11300)
    expect(data?.creditLimit).not.toBe(45200)
  })

  it("descarta 'NA' e string vazia em vez de exibi-los", () => {
    const data = extractCreditData({ brand: "NA", level: "  ", creditLimit: 700 })
    expect(data?.brand).toBeNull()
    expect(data?.level).toBeNull()
    expect(data?.creditLimit).toBe(700)
  })

  it("devolve null quando a conta não é de crédito", () => {
    expect(extractCreditData(null)).toBeNull()
    expect(extractCreditData(undefined)).toBeNull()
    expect(extractCreditData({})).toBeNull()
  })
})

describe("summarizeCreditLimits", () => {
  // Os cinco cartões dele, com os números do último sync.
  const cards = [
    { id: "1", name: "gold", creditLimit: 11300, availableCreditLimit: 8328.97, creditDataAt: "2026-09-07T03:00:23.518Z" },
    { id: "2", name: "Mercado Pago", creditLimit: 1700, availableCreditLimit: 1397.32, creditDataAt: "2026-09-07T03:05:00.000Z" },
    { id: "3", name: "GOLD", creditLimit: 700, availableCreditLimit: 700, creditDataAt: "2026-09-07T03:06:00.000Z" },
    { id: "4", name: "BANDEIRADO", creditLimit: 400, availableCreditLimit: 399.94, creditDataAt: "2026-09-07T03:07:00.000Z" },
    { id: "5", name: "OUROCARD UNIVERSITARIO VISA", creditLimit: 0, availableCreditLimit: 0, creditDataAt: "2026-09-07T03:08:00.000Z" },
  ]

  it("soma os limites informados e nomeia quem não informou", () => {
    const summary = summarizeCreditLimits(cards)
    expect(summary.totalLimit).toBe(14100)
    expect(summary.countedAccounts).toBe(4)
    expect(summary.missingLimitNames).toEqual(["OUROCARD UNIVERSITARIO VISA"])
  })

  it("calcula o usado como limite menos disponível", () => {
    const summary = summarizeCreditLimits(cards)
    expect(summary.totalAvailable).toBeCloseTo(10826.23, 2)
    expect(summary.totalUsed).toBeCloseTo(3273.77, 2)
    expect(summary.usedRatio).toBeCloseTo(23.22, 1)
  })

  it("cartão com limite 0 não entra na soma como zero silencioso", () => {
    const summary = summarizeCreditLimits([
      { id: "1", name: "sem limite", creditLimit: 0, availableCreditLimit: 0 },
    ])
    expect(summary.totalLimit).toBe(0)
    expect(summary.countedAccounts).toBe(0)
    expect(summary.usedRatio).toBeNull()
    expect(summary.missingLimitNames).toEqual(["sem limite"])
  })

  it("reporta o dado mais velho entre os cartões somados", () => {
    const summary = summarizeCreditLimits(cards)
    expect(summary.oldestDataAt).toBe("2026-09-07T03:00:23.518Z")
  })

  it("limite sem disponível conta o limite e fica fora do usado", () => {
    const summary = summarizeCreditLimits([
      { id: "1", name: "só limite", creditLimit: 5000, availableCreditLimit: null },
    ])
    expect(summary.totalLimit).toBe(5000)
    expect(summary.countedAccounts).toBe(1)
    // Sem disponível não há como saber o usado — e "usado 5.000" assustaria à toa.
    expect(summary.totalUsed).toBe(0)
    expect(summary.usedRatio).toBeNull()
    expect(summary.missingAvailableNames).toEqual(["só limite"])
  })
})
