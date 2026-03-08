import { NextResponse } from "next/server"

import { fetchItem, fetchTransactions } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

function isReady(status?: string) {
  return status === "UPDATED"
}

function parseNumber(value: string | null) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
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

  const page = parseNumber(searchParams.get("page"))
  const pageSize = parseNumber(searchParams.get("pageSize"))

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
  const transactionsByItem = await Promise.all(
    readyItems.map(async (item) => ({
      itemId: item.itemId,
      transactions: await fetchTransactions(item.itemId, { page, pageSize }),
    }))
  )

  return NextResponse.json({
    items,
    transactions: transactionsByItem.flatMap((entry) => entry.transactions),
  })
}
