import { describe, expect, it } from "vitest"

import { extractCursor, PluggyApiError } from "./pluggy"

describe("PluggyApiError", () => {
  it("flags rate limit and transient status codes", () => {
    const rateLimited = new PluggyApiError({
      statusCode: 429,
      message: "rate limit",
      retryAfterSeconds: 12,
    })
    expect(rateLimited.isRateLimit).toBe(true)
    expect(rateLimited.isTransient).toBe(false)
    expect(rateLimited.retryAfterSeconds).toBe(12)

    const serverError = new PluggyApiError({ statusCode: 502, message: "bad gateway" })
    expect(serverError.isTransient).toBe(true)
    expect(serverError.isRateLimit).toBe(false)

    const badRequest = new PluggyApiError({ statusCode: 400, message: "invalid" })
    expect(badRequest.isTransient).toBe(false)
    expect(badRequest.isRateLimit).toBe(false)
  })

  it("preserves the Pluggy error code for balance/consent handling", () => {
    const consent = new PluggyApiError({
      statusCode: 403,
      message: "consent",
      code: "BALANCE_CONSENT_ERROR",
    })
    expect(consent.code).toBe("BALANCE_CONSENT_ERROR")
    expect(consent.statusCode).toBe(403)
  })
})

describe("extractCursor (paginação da v2)", () => {
  it("extrai o cursor da querystring que a Pluggy devolve em `next`", () => {
    const next =
      "?accountId=562b795d-1653-429f-be86-74ead9502813&after=MjAyMC0xMC0xNVQwMDowMDowMC4wMDBafGE4NTM0Yzg1LTUzY2UtNGYyMS05NGQ3LTUwZTlkMmVlNDk1Nw=="
    expect(extractCursor(next)).toBe(
      "MjAyMC0xMC0xNVQwMDowMDowMC4wMDBafGE4NTM0Yzg1LTUzY2UtNGYyMS05NGQ3LTUwZTlkMmVlNDk1Nw==",
    )
  })

  it("aceita a mesma querystring sem o `?` inicial", () => {
    expect(extractCursor("accountId=abc&after=CURSOR123")).toBe("CURSOR123")
  })

  it("aceita um cursor cru (sem querystring)", () => {
    expect(extractCursor("CURSOR123")).toBe("CURSOR123")
  })

  it("devolve null no fim da paginação", () => {
    // Um `next` nulo tem de encerrar o laço; devolver string vazia faria a
    // primeira página ser relida para sempre.
    expect(extractCursor(null)).toBeNull()
    expect(extractCursor(undefined)).toBeNull()
    expect(extractCursor("")).toBeNull()
  })

  it("devolve null quando a querystring não tem `after`", () => {
    expect(extractCursor("?accountId=abc")).toBeNull()
  })
})
