import { NextResponse } from "next/server"

import { updateItem, getItemIdFromEnv } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemId = searchParams.get("itemId") ?? getItemIdFromEnv()
  const item = await updateItem(itemId)

  return NextResponse.json(item)
}
