import { NextResponse } from "next/server"

import { createApiKey, createConnectToken } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let options: Record<string, unknown> | undefined

  try {
    options = await request.json()
  } catch {
    options = undefined
  }

  const apiKeyResponse = await createApiKey()
  const apiKey = apiKeyResponse?.apiKey ?? apiKeyResponse?.token ?? apiKeyResponse

  if (!apiKey || typeof apiKey !== "string") {
    return NextResponse.json(
      { error: "Api key invalida retornada pelo Pluggy" },
      { status: 500 }
    )
  }

  const connectToken = await createConnectToken(
    apiKey,
    options && Object.keys(options).length ? options : undefined
  )
  return NextResponse.json(connectToken)
}
