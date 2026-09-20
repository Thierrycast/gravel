import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { buildOutboundAudit, redactText, sanitizeToolResult } from "./guard"

describe("redactText", () => {
  it("mascara CPF, e-mail e telefone", () => {
    const result = redactText(
      "Meu CPF é 123.456.789-09, e-mail thierry@exemplo.com e telefone (11) 98765-4321.",
    )
    expect(result.text).not.toContain("123.456.789-09")
    expect(result.text).not.toContain("thierry@exemplo.com")
    expect(result.text).not.toContain("98765-4321")
    expect(result.redactedCount).toBeGreaterThanOrEqual(3)
  })

  it("mascara chave de API colada por acidente", () => {
    const result = redactText("a chave é sk-abcdefghijklmnopqrstuvwxyz123456 ok?")
    expect(result.text).toContain("[segredo removido]")
    expect(result.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456")
  })

  it("mascara número de cartão em blocos e corrido", () => {
    expect(redactText("5555 4444 3333 2222").text).toContain("[cartão removido]")
    expect(redactText("5555444433332222").text).toContain("[cartão removido]")
  })

  it("mascara chave Pix aleatória", () => {
    const result = redactText("pix: 06d771e1-3f16-4aee-ab04-9743dfe5fa96")
    expect(result.text).toContain("[chave Pix removida]")
  })

  it("deixa valor em reais passar — senão o chat não responde nada sobre dinheiro", () => {
    // O caso que motiva a exceção: o limite real do cartão dele.
    const result = redactText("O limite do cartão é R$ 11.300,00 e a fatura R$ 2.971,03.")
    expect(result.text).toContain("11.300,00")
    expect(result.text).toContain("2.971,03")
    expect(result.redactedCount).toBe(0)
  })

  it("não inventa mascaramento em texto comum", () => {
    const result = redactText("Quanto gastei em mercado nos últimos 30 dias?")
    expect(result.redactedCount).toBe(0)
    expect(result.text).toBe("Quanto gastei em mercado nos últimos 30 dias?")
  })
})

describe("sanitizeToolResult", () => {
  it("remove chave bloqueada em qualquer profundidade", () => {
    const { value } = sanitizeToolResult({
      name: "gold",
      balance: 2971.03,
      number: "7208",
      taxNumber: "12345678909",
      ownerName: "Ana Paula de Souza Lima",
      nested: { metadataJson: '{"subtype":"CREDIT_CARD"}', creditLimit: 11300 },
    })
    const flat = JSON.stringify(value)
    expect(flat).not.toContain("7208")
    expect(flat).not.toContain("12345678909")
    expect(flat).not.toContain("Thierry")
    expect(flat).not.toContain("metadataJson")
    expect(flat).toContain("11300")
    expect(flat).toContain("gold")
  })

  it("não deixa payload cru de provedor virar contexto", () => {
    const { value } = sanitizeToolResult({
      payloadJson: '{"creditData":{"creditLimit":11300}}',
      creditLimit: 11300,
    })
    expect(JSON.stringify(value)).not.toContain("creditData")
  })

  it("corta string gigante em vez de mandar tudo", () => {
    const { value } = sanitizeToolResult({ description: "x".repeat(5000) })
    const text = (value as { description: string }).description
    expect(text.length).toBeLessThan(2_100)
    expect(text).toContain("[texto cortado]")
  })

  it("relata o que mascarou, para a trilha de auditoria", () => {
    const { redactions } = sanitizeToolResult({
      note: "falar com thierry@exemplo.com",
      other: "cpf 123.456.789-09",
    })
    expect(redactions.email).toBe(1)
    expect(redactions.cpf).toBe(1)
  })

  it("serializa Decimal e Date sem quebrar", () => {
    // Decimal de verdade: `Object.entries` nele devolve o miolo (`s`, `e`, `d`),
    // e sem o tratamento o modelo receberia estrutura interna em vez do número.
    const { value } = sanitizeToolResult({
      amount: new Prisma.Decimal("1234.56"),
      when: new Date("2026-09-10T12:00:00.000Z"),
    })
    expect(value).toEqual({ amount: "1234.56", when: "2026-09-10T12:00:00.000Z" })
  })
})

describe("buildOutboundAudit", () => {
  it("registra provedor, modelo, bytes e contagem de mascaramento", () => {
    const audit = buildOutboundAudit({
      provider: "openai-compatible",
      model: "omniroute/glm-4.6",
      payload: { messages: [{ role: "user", content: "oi" }] },
      redactions: { cpf: 1, email: 2 },
      toolNames: ["visao_geral"],
    })
    expect(audit.outboundBytes).toBeGreaterThan(0)
    expect(audit.redactedCount).toBe(3)
    expect(audit.toolNames).toEqual(["visao_geral"])
    expect(audit.provider).toBe("openai-compatible")
  })
})
