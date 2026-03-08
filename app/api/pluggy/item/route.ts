import { NextResponse } from "next/server"

import { fetchItem } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemIds = await resolveStoredPluggyItemIds(searchParams.get("itemId"))

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "Nenhum item Pluggy salvo" },
      { status: 400 }
    )
  }

  const items = await Promise.all(itemIds.map((itemId) => fetchItem(itemId)))

  return NextResponse.json(items)
}
