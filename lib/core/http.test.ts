import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"
import { jsonOk, jsonError, serializeForJson } from "./http"

describe("serializeForJson", () => {
  it("returns primitives unchanged", () => {
    expect(serializeForJson(42)).toBe(42)
    expect(serializeForJson("hello")).toBe("hello")
    expect(serializeForJson(true)).toBe(true)
    expect(serializeForJson(false)).toBe(false)
    expect(serializeForJson(null)).toBe(null)
  })

  it("preserves undefined values", () => {
    expect(serializeForJson(undefined)).toBeUndefined()
  })

  it("converts Prisma.Decimal to number", () => {
    const decimal = new Prisma.Decimal("123.45")
    expect(serializeForJson(decimal)).toBe(123.45)
  })

  it("converts Date to ISO string", () => {
    const date = new Date("2024-06-15T12:00:00.000Z")
    expect(serializeForJson(date)).toBe("2024-06-15T12:00:00.000Z")
  })

  it("serializes arrays recursively", () => {
    const input = [
      new Prisma.Decimal("10"),
      new Date("2024-01-01T00:00:00.000Z"),
      5,
      "text",
    ]
    expect(serializeForJson(input)).toEqual([
      10,
      "2024-01-01T00:00:00.000Z",
      5,
      "text",
    ])
  })

  it("serializes plain objects recursively", () => {
    const input = {
      amount: new Prisma.Decimal("99.99"),
      createdAt: new Date("2024-03-01T00:00:00.000Z"),
      name: "test",
      active: true,
    }
    expect(serializeForJson(input)).toEqual({
      amount: 99.99,
      createdAt: "2024-03-01T00:00:00.000Z",
      name: "test",
      active: true,
    })
  })

  it("handles nested objects containing arrays", () => {
    const input = {
      items: [
        { price: new Prisma.Decimal("1.5") },
        { price: new Prisma.Decimal("2.5") },
      ],
    }
    expect(serializeForJson(input)).toEqual({
      items: [{ price: 1.5 }, { price: 2.5 }],
    })
  })

  it("handles deeply nested structures", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            amount: new Prisma.Decimal("7.25"),
            when: new Date("2025-12-31T23:59:59.000Z"),
          },
        },
      },
    }
    expect(serializeForJson(input)).toEqual({
      level1: {
        level2: {
          level3: {
            amount: 7.25,
            when: "2025-12-31T23:59:59.000Z",
          },
        },
      },
    })
  })

  it("does not mutate the original object", () => {
    const decimal = new Prisma.Decimal("10")
    const input = { amount: decimal }
    serializeForJson(input)
    expect(input.amount).toBe(decimal)
    expect(input.amount).toBeInstanceOf(Prisma.Decimal)
  })
})

describe("jsonOk", () => {
  it("wraps payload in the success envelope with defaults", async () => {
    const response = jsonOk({})
    const body = await response.json()
    expect(body).toEqual({
      status: "success",
      summary: null,
      results: null,
      meta: null,
      error: null,
    })
  })

  it("includes the provided summary, results and meta", async () => {
    const response = jsonOk({
      summary: { total: 10 },
      results: [{ id: 1 }],
      meta: { page: 1 },
    })
    const body = await response.json()
    expect(body).toEqual({
      status: "success",
      summary: { total: 10 },
      results: [{ id: 1 }],
      meta: { page: 1 },
      error: null,
    })
  })

  it("uses the provided status string", async () => {
    const response = jsonOk({ status: "partial" })
    const body = await response.json()
    expect(body.status).toBe("partial")
  })

  it("serializes Prisma.Decimal values inside results", async () => {
    const response = jsonOk({
      results: { amount: new Prisma.Decimal("42.5") },
    })
    const body = await response.json()
    expect(body.results).toEqual({ amount: 42.5 })
  })

  it("serializes Date values inside summary", async () => {
    const response = jsonOk({
      summary: { since: new Date("2024-02-02T00:00:00.000Z") },
    })
    const body = await response.json()
    expect(body.summary).toEqual({ since: "2024-02-02T00:00:00.000Z" })
  })

  it("returns HTTP 200 by default", () => {
    const response = jsonOk({})
    expect(response.status).toBe(200)
  })
})

describe("jsonError", () => {
  it("extracts the message from an Error instance", async () => {
    const response = jsonError(new Error("Something failed"))
    const body = await response.json()
    expect(body).toEqual({
      status: "error",
      summary: null,
      results: null,
      meta: null,
      error: { message: "Something failed" },
    })
  })

  it("uses the default message for non-Error values", async () => {
    const response = jsonError("string error")
    const body = await response.json()
    expect(body.error).toEqual({ message: "Erro desconhecido" })
  })

  it("uses the default message for null", async () => {
    const response = jsonError(null)
    const body = await response.json()
    expect(body.error.message).toBe("Erro desconhecido")
  })

  it("uses the default message for undefined", async () => {
    const response = jsonError(undefined)
    const body = await response.json()
    expect(body.error.message).toBe("Erro desconhecido")
  })

  it("uses HTTP 500 by default", () => {
    const response = jsonError(new Error("oops"))
    expect(response.status).toBe(500)
  })

  it("respects the provided status code", () => {
    const response = jsonError(new Error("bad request"), 400)
    expect(response.status).toBe(400)
  })

  it("includes meta when provided", async () => {
    const response = jsonError(new Error("fail"), 500, { requestId: "abc" })
    const body = await response.json()
    expect(body.meta).toEqual({ requestId: "abc" })
  })

  it("serializes Prisma.Decimal values inside meta", async () => {
    const response = jsonError(new Error("fail"), 500, {
      charge: new Prisma.Decimal("12.34"),
    })
    const body = await response.json()
    expect(body.meta).toEqual({ charge: 12.34 })
  })

  it("propagates messages from subclasses of Error", async () => {
    class CustomError extends Error {
      constructor() {
        super("custom failure")
      }
    }
    const response = jsonError(new CustomError())
    const body = await response.json()
    expect(body.error.message).toBe("custom failure")
  })
})
