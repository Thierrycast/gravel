import { NextResponse } from "next/server"

import { fetchItem, getItemIdFromEnv } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

type ItemParameter = {
  type?: string
  data?: { url?: string; expiresAt?: string }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get("itemId") ?? getItemIdFromEnv()
  const item = await fetchItem(itemId)
  const parameter = item?.parameter as ItemParameter | undefined

  if (parameter?.type !== "oauth" || !parameter?.data?.url) {
    return NextResponse.json(
      { status: item?.status ?? "UNKNOWN" },
      { status: 409 }
    )
  }

  return NextResponse.json({
    itemId: item?.id ?? itemId,
    oauthUrl: parameter.data.url,
    expiresAt: parameter.data.expiresAt ?? null,
  })
}
