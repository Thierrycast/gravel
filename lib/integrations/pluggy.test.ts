import { describe, expect, it } from "vitest"

import { PluggyApiError } from "./pluggy"

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
