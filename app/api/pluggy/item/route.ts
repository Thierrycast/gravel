import { NextResponse } from "next/server"

import { fetchItem, getItemIdFromEnv } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get("itemId") ?? getItemIdFromEnv()
  const item = await fetchItem(itemId)

  return NextResponse.json(item)
}
