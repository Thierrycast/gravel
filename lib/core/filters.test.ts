import { describe, it, expect } from "vitest"
import {
  parseNumberParam,
  parseDateParam,
  normalizePagination,
  parseBooleanParam,
} from "./filters"

describe("parseNumberParam", () => {
  it("returns fallback when value is null", () => {
    expect(parseNumberParam(null, 10)).toBe(10)
  })

  it("returns fallback when value is empty string", () => {
    expect(parseNumberParam("", 5)).toBe(5)
  })

  it("returns undefined when value is null and no fallback is provided", () => {
    expect(parseNumberParam(null)).toBeUndefined()
  })

  it("parses a valid integer string", () => {
    expect(parseNumberParam("42")).toBe(42)
  })

  it("parses a valid decimal string", () => {
    expect(parseNumberParam("3.14")).toBe(3.14)
  })

  it("parses negative numbers", () => {
    expect(parseNumberParam("-7")).toBe(-7)
  })

  it("parses zero as a valid number", () => {
    expect(parseNumberParam("0", 99)).toBe(0)
  })

  it("returns fallback when value is not a finite number", () => {
    expect(parseNumberParam("abc", 99)).toBe(99)
  })

  it("returns fallback for Infinity", () => {
    expect(parseNumberParam("Infinity", 1)).toBe(1)
  })

  it("returns fallback for NaN-producing strings", () => {
    expect(parseNumberParam("NaN", 7)).toBe(7)
  })
})

describe("parseDateParam", () => {
  it("returns undefined when value is null", () => {
    expect(parseDateParam(null)).toBeUndefined()
  })

  it("returns undefined when value is empty string", () => {
    expect(parseDateParam("")).toBeUndefined()
  })

  it("parses a valid ISO date", () => {
    const result = parseDateParam("2024-01-15T10:00:00.000Z")
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe("2024-01-15T10:00:00.000Z")
  })

  it("parses a date-only string", () => {
    const result = parseDateParam("2024-06-01")
    expect(result).toBeInstanceOf(Date)
    expect(Number.isNaN(result?.getTime())).toBe(false)
  })

  it("returns undefined for a clearly invalid date", () => {
    expect(parseDateParam("not-a-date")).toBeUndefined()
  })
})

describe("normalizePagination", () => {
  it("uses defaults when no arguments are given", () => {
    expect(normalizePagination()).toEqual({
      page: 1,
      pageSize: 50,
      skip: 0,
      take: 50,
    })
  })

  it("uses provided page and pageSize", () => {
    expect(normalizePagination(3, 20)).toEqual({
      page: 3,
      pageSize: 20,
      skip: 40,
      take: 20,
    })
  })

  it("falls back to page 1 when page is 0 or negative", () => {
    expect(normalizePagination(0, 10).page).toBe(1)
    expect(normalizePagination(-5, 10).page).toBe(1)
  })

  it("caps pageSize at 500", () => {
    const result = normalizePagination(1, 1000)
    expect(result.pageSize).toBe(500)
    expect(result.take).toBe(500)
  })

  it("falls back to pageSize 50 when pageSize is 0 or negative", () => {
    expect(normalizePagination(1, 0).pageSize).toBe(50)
    expect(normalizePagination(1, -20).pageSize).toBe(50)
  })

  it("calculates skip as (page - 1) * pageSize", () => {
    expect(normalizePagination(5, 25).skip).toBe(100)
    expect(normalizePagination(1, 25).skip).toBe(0)
  })

  it("keeps take equal to the final pageSize", () => {
    const result = normalizePagination(2, 30)
    expect(result.take).toBe(result.pageSize)
  })
})

describe("parseBooleanParam", () => {
  it("returns true for 'true'", () => {
    expect(parseBooleanParam("true")).toBe(true)
  })

  it("returns true for '1'", () => {
    expect(parseBooleanParam("1")).toBe(true)
  })

  it("returns false for 'false'", () => {
    expect(parseBooleanParam("false")).toBe(false)
  })

  it("returns false for '0'", () => {
    expect(parseBooleanParam("0")).toBe(false)
  })

  it("returns false for null", () => {
    expect(parseBooleanParam(null)).toBe(false)
  })

  it("returns false for an empty string", () => {
    expect(parseBooleanParam("")).toBe(false)
  })

  it("returns false for arbitrary truthy-looking strings", () => {
    expect(parseBooleanParam("yes")).toBe(false)
    expect(parseBooleanParam("TRUE")).toBe(false)
    expect(parseBooleanParam("on")).toBe(false)
  })
})
