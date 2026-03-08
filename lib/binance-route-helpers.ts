import { NextResponse } from "next/server"

export function parseBooleanParam(value: string | null) {
  return value === "true" || value === "1"
}

export function parseNumberParam(value: string | null) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro desconhecido"
  return NextResponse.json({ error: message }, { status: 500 })
}
