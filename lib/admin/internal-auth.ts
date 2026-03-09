import { NextResponse } from "next/server"

function getInternalApiKey() {
  return process.env.INTERNAL_API_KEY
}

export function ensureInternalApiKey(request: Request) {
  const configuredKey = getInternalApiKey()

  if (!configuredKey) {
    return NextResponse.json(
      {
        status: "error",
        summary: null,
        results: null,
        meta: null,
        error: { message: "INTERNAL_API_KEY nao configurada" },
      },
      { status: 500 }
    )
  }

  const incomingKey = request.headers.get("X-INTERNAL-API-KEY")
  if (incomingKey !== configuredKey) {
    return NextResponse.json(
      {
        status: "error",
        summary: null,
        results: null,
        meta: null,
        error: { message: "Nao autorizado" },
      },
      { status: 401 }
    )
  }

  return null
}
