import { NextResponse } from "next/server"

import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionConfig,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/server/session"

export const dynamic = "force-dynamic"

/**
 * Troca a senha por um cookie de sessão.
 *
 * O atraso no erro é de propósito: sem ele, uma tentativa por milissegundo
 * torna a senha de um app pessoal (curta, memorizável) quebrável por força
 * bruta numa tarde. Não é rate limit de verdade — é o suficiente para um app
 * de um usuário só atrás da tailnet.
 */
export async function POST(request: Request) {
  const { password, secret } = readSessionConfig(process.env)

  if (!password || !secret) {
    return NextResponse.json(
      { status: "error", error: { message: "APP_PASSWORD não configurada no ambiente." } },
      { status: 503 },
    )
  }

  let candidate = ""
  try {
    const body = await request.json()
    candidate = typeof body?.password === "string" ? body.password : ""
  } catch {
    candidate = ""
  }

  if (!verifyPassword(candidate, password)) {
    await new Promise((resolve) => setTimeout(resolve, 400))
    return NextResponse.json(
      { status: "error", error: { message: "Senha incorreta." } },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ status: "success", results: { ok: true } })
  response.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    ...sessionCookieOptions,
    // `secure` só quando veio por HTTPS: o app também é acessado por http no
    // IP da tailnet, e um cookie `secure` simplesmente não seria gravado lá.
    secure: new URL(request.url).protocol === "https:",
  })
  return response
}
