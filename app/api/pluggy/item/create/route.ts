import { NextResponse } from "next/server"

import { createItem } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: Record<string, unknown> | undefined

  try {
    body = await request.json()
  } catch {
    body = undefined
  }

  const connectorId =
    typeof body?.connectorId === "number" ? body.connectorId : undefined
  const oauthRedirectUri =
    typeof body?.oauthRedirectUri === "string" ? body.oauthRedirectUri : undefined
  const parameters =
    typeof body?.parameters === "object" && body?.parameters
      ? (body.parameters as Record<string, string>)
      : undefined

  const item = await createItem({ connectorId, parameters, oauthRedirectUri })
  return NextResponse.json(item)
}
