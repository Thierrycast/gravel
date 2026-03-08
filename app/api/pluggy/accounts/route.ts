import { NextResponse } from "next/server"

import { fetchAccounts, fetchItem } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

function isReady(status?: string) {
  return status === "UPDATED"
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const itemIds = await resolveStoredPluggyItemIds(searchParams.get("itemId"))

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "Nenhum item Pluggy salvo" },
      { status: 400 }
    )
  }

  const items = await Promise.all(
    itemIds.map(async (itemId) => {
      const item = await fetchItem(itemId)
      return {
        itemId,
        status: item?.status ?? "UNKNOWN",
        connector: item?.connector ?? null,
      }
    })
  )

  const readyItems = items.filter((item) => isReady(item.status))
  const accountsByItem = await Promise.all(
    readyItems.map(async (item) => ({
      itemId: item.itemId,
      accounts: await fetchAccounts({ itemId: item.itemId }),
    }))
  )

  const results = accountsByItem.flatMap((entry) =>
    Array.isArray(entry.accounts?.results) ? entry.accounts.results : []
  )

  return NextResponse.json({
    items,
    totalItems: items.length,
    readyItems: readyItems.length,
    totalAccounts: results.length,
    results,
    pagesByItem: accountsByItem,
  })
}
