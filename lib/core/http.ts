import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

function serializeValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toString()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => [
        key,
        serializeValue(currentValue),
      ])
    )
  }

  return value
}

export function jsonOk(payload: {
  status?: string
  summary?: unknown
  results?: unknown
  meta?: unknown
}) {
  return NextResponse.json(serializeValue({
    status: payload.status ?? "success",
    summary: payload.summary ?? null,
    results: payload.results ?? null,
    meta: payload.meta ?? null,
    error: null,
  }))
}

export function jsonError(
  error: unknown,
  status = 500,
  meta?: Record<string, unknown>
) {
  const message = error instanceof Error ? error.message : "Erro desconhecido"

  return NextResponse.json(
    serializeValue({
      status: "error",
      summary: null,
      results: null,
      meta: meta ?? null,
      error: {
        message,
      },
    }),
    { status }
  )
}

export function serializeForJson<T>(payload: T) {
  return serializeValue(payload) as T
}
