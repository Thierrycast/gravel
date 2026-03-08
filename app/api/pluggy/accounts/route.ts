import { NextResponse } from "next/server"

import { fetchAccounts, fetchItem } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemId } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

function isReady(status?: string) {
  return status === "UPDATED"
}

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

  if (!isReady(item?.status)) {
    return NextResponse.json(
      { itemId, status: item?.status ?? "UNKNOWN" },
      { status: 409 }
    )
  }

  const accounts = await fetchAccounts(itemId)
  return NextResponse.json(accounts)
}
