import { NextResponse } from "next/server"

import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const response = NextResponse.json({ status: "success", results: { ok: true } })
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions,
    maxAge: 0,
    secure: new URL(request.url).protocol === "https:",
  })
  return response
}
