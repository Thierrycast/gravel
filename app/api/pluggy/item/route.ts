import { NextResponse } from "next/server"

import { fetchItem } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemId } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemId = await resolveStoredPluggyItemId(searchParams.get("itemId"))

  if (!itemId) {
    return NextResponse.json(
      { error: "Nenhum item Pluggy salvo" },
      { status: 400 }
    )
  }

  const item = await fetchItem(itemId)

  return NextResponse.json(item)
}
