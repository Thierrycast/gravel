import { describe, expect, it } from "vitest"

import {
  constantTimeEquals,
  extractCreatedAtFrom,
  parseWebhookPayload,
  WebhookPayloadError,
} from "./webhook-payload"

describe("parseWebhookPayload", () => {
  // Este é o caso que estava quebrado em produção: o handler antigo exigia
  // `body.id`, e o payload de `item/*` da Pluggy não tem esse campo — todo
  // `item/updated` levava 400 e o banco nunca era atualizado.
  it("aceita evento de item que só traz eventId (sem `id`)", () => {
    const payload = parseWebhookPayload({
      event: "item/updated",
      eventId: "d876fd7c-e9bd-4c4c-bd46-cc96c62aac29",
      itemId: "a5c763cb-0952-457b-9936-630f79c5b016",
      triggeredBy: "SYNC",
      clientUserId: "client-user-id",
    })

    expect(payload.eventId).toBe("d876fd7c-e9bd-4c4c-bd46-cc96c62aac29")
    expect(payload.itemId).toBe("a5c763cb-0952-457b-9936-630f79c5b016")
    expect(payload.triggeredBy).toBe("SYNC")
    expect(payload.transactionIds).toEqual([])
  })

  it("usa `id` como fallback quando `eventId` não vem", () => {
    const payload = parseWebhookPayload({
      event: "connector/status_updated",
      id: "201",
      connectorId: "201",
      data: { status: "UNSTABLE" },
    })

    expect(payload.eventId).toBe("201")
    expect(payload.connectorId).toBe("201")
    expect(payload.data?.status).toBe("UNSTABLE")
  })

  it("extrai accountId e a marca temporal de transactions/created", () => {
    const payload = parseWebhookPayload({
      itemId: "de7bbf5a-abf2-47e4-94b1-586b36758423",
      event: "transactions/created",
      id: "de7bbf5a-abf2-47e4-94b1-586b36758423",
      eventId: "4e69d62d-b7c8-4f01-b591-a1d8a94710b9",
      accountId: "0d5a0de2-9c82-4ea2-af50-31643a632a33",
      transactionsCount: 332,
      transactionsCreatedAtFrom: "2025-02-13T17:21:53.719Z",
      createdTransactionsLinkV2:
        "https://api.pluggy.ai/v2/transactions?accountId=0d5a0de2-9c82-4ea2-af50-31643a632a33&createdAtFrom=2025-02-13T17:21:53.719Z&after={cursor}",
    })

    expect(payload.accountId).toBe("0d5a0de2-9c82-4ea2-af50-31643a632a33")
    expect(payload.transactionsCreatedAtFrom).toBe("2025-02-13T17:21:53.719Z")
    expect(extractCreatedAtFrom(payload.createdTransactionsLinkV2)).toBe(
      "2025-02-13T17:21:53.719Z",
    )
  })

  it("coleta os ids de transactions/updated e descarta entradas inválidas", () => {
    const payload = parseWebhookPayload({
      event: "transactions/updated",
      eventId: "d876fd7c-e9bd-4c4c-bd46-cc96c62aac29",
      itemId: "a5c763cb-0952-457b-9936-630f79c5b016",
      accountId: "8a6e2c17-2817-40bb-b03d-546febc6a60a",
      transactionIds: [
        "5a14feae-eaa7-423a-820c-6b83837c35b7",
        "",
        null,
        42,
        "786c7d98-6085-4879-9c7f-2255260e2436",
      ],
    })

    expect(payload.transactionIds).toEqual([
      "5a14feae-eaa7-423a-820c-6b83837c35b7",
      "786c7d98-6085-4879-9c7f-2255260e2436",
    ])
  })

  it("preserva o erro estruturado de item/error", () => {
    const payload = parseWebhookPayload({
      event: "item/error",
      eventId: "d876fd7c-e9bd-4c4c-bd46-cc96c62aac29",
      itemId: "d161a74a-8bc8-4093-88de-724312969b0d",
      error: {
        code: "USER_INPUT_TIMEOUT",
        message: "User requested input had expired",
        parameter: "token",
      },
    })

    expect(payload.error).toEqual({
      code: "USER_INPUT_TIMEOUT",
      message: "User requested input had expired",
      parameter: "token",
    })
  })

  it("rejeita corpo sem event ou sem identificador", () => {
    expect(() => parseWebhookPayload({ eventId: "abc" })).toThrow(
      WebhookPayloadError,
    )
    expect(() => parseWebhookPayload({ event: "item/updated" })).toThrow(
      WebhookPayloadError,
    )
    expect(() => parseWebhookPayload(null)).toThrow(WebhookPayloadError)
    expect(() => parseWebhookPayload("nope")).toThrow(WebhookPayloadError)
    expect(() => parseWebhookPayload([])).toThrow(WebhookPayloadError)
  })

  it("guarda o payload cru para reprocessamento", () => {
    const body = { event: "item/updated", eventId: "e1", extra: { a: 1 } }
    expect(parseWebhookPayload(body).raw).toEqual(body)
  })
})

describe("extractCreatedAtFrom", () => {
  it("devolve null para link ausente ou inválido", () => {
    expect(extractCreatedAtFrom(null)).toBeNull()
    expect(extractCreatedAtFrom(undefined)).toBeNull()
    expect(extractCreatedAtFrom("não é uma url")).toBeNull()
  })

  it("devolve null quando a URL não tem o parâmetro", () => {
    expect(
      extractCreatedAtFrom("https://api.pluggy.ai/v2/transactions?accountId=x"),
    ).toBeNull()
  })
})

describe("constantTimeEquals", () => {
  it("compara segredos iguais e diferentes", () => {
    expect(constantTimeEquals("segredo", "segredo")).toBe(true)
    expect(constantTimeEquals("segredo", "segred0")).toBe(false)
  })

  it("não estoura com comprimentos diferentes", () => {
    expect(constantTimeEquals("curto", "bem mais longo")).toBe(false)
    expect(constantTimeEquals("", "x")).toBe(false)
    expect(constantTimeEquals("", "")).toBe(true)
  })
})
