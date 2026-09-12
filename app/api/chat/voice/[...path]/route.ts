import { NextRequest, NextResponse } from "next/server"

import { resolveSpeechConfig } from "@/lib/ai/speech"

const ALLOWED_PATHS = new Set([
  "tts/stream",
  "v1/audio/speech",
  "v1/audio/transcriptions",
])

export const dynamic = "force-dynamic"

/**
 * Barra página de outra origem usando o proxy de voz do usuário. Requisição sem
 * `Origin` continua valendo — CLI e automação não mandam o header, e navegador
 * não o forja. Atrás do Traefik/Tailscale o host que o browser viu é o
 * `x-forwarded-host`, não o do request interno.
 */
function isSameOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false

  const origin = request.headers.get("origin")
  if (!origin) return true
  // `null` chega de iframe sandboxed, redirect opaco e file:// — nunca é o app.
  if (origin === "null") return false

  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = forwarded || request.headers.get("host")?.trim() || request.nextUrl.host
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "origem não confiável" }, { status: 403 })
  }

  const path = (await params).path.join("/")
  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: "rota de voz inválida" }, { status: 404 })
  }

  const config = await resolveSpeechConfig()
  if (!config) {
    return NextResponse.json({ error: "speech-api não configurado" }, { status: 503 })
  }

  try {
    const body = await request.arrayBuffer()
    const response = await fetch(`${config.baseUrl}/${path}`, {
      method: "POST",
      headers: {
        accept: request.headers.get("accept") ?? "*/*",
        "content-type": request.headers.get("content-type") ?? "application/octet-stream",
      },
      body,
      signal: request.signal,
    })
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "no-store",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: `speech-api indisponível: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    )
  }
}
