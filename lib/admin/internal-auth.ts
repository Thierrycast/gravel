import { NextResponse } from "next/server"

import { constantTimeEquals } from "@/lib/ingestion/webhook-payload"

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
  // `!==` sai no primeiro byte diferente. A diferença de tempo entre "errou no
  // primeiro caractere" e "errou no último" é medível, e com ela a chave sai
  // byte a byte. O helper já existia em webhook-payload.ts — faltava usá-lo aqui.
  if (!incomingKey || !constantTimeEquals(incomingKey, configuredKey)) {
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
