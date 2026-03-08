import { NextResponse } from "next/server"

import { createConnectToken, getApiKey } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let options: Record<string, unknown> | undefined

  try {
    options = await request.json()
  } catch {
    options = undefined
  }

  const apiKey = await getApiKey()

  const connectToken = await createConnectToken(
    apiKey,
    options && Object.keys(options).length ? options : undefined
  )
  return NextResponse.json(connectToken)
}
