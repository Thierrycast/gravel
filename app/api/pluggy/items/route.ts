import { NextResponse } from "next/server"

import { fetchItem } from "@/lib/integrations/pluggy"
import {
  listStoredPluggyItems,
  savePluggyItem,
  updateStoredPluggyItem,
} from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

export async function GET() {
  const items = await listStoredPluggyItems()

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      try {
        const liveItem = await fetchItem(item.pluggyItemId)
        await updateStoredPluggyItem({
          itemId: item.pluggyItemId,
          connectorId: liveItem?.connector?.id,
          connectorName: liveItem?.connector?.name,
          status: liveItem?.status,
        })

        return {
          ...item,
          connectorId: liveItem?.connector?.id ?? item.connectorId,
          connectorName: liveItem?.connector?.name ?? item.connectorName,
          status: liveItem?.status ?? item.status,
        }
      } catch {
        return item
      }
    })
  )

  return NextResponse.json(enrichedItems)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        itemId?: string
        connectorId?: number
        connectorName?: string
        status?: string
      }
    | null

  if (!body?.itemId) {
    return NextResponse.json(
      { error: "itemId e obrigatorio" },
      { status: 400 }
    )
  }

  const item = await savePluggyItem({
    itemId: body.itemId,
    connectorId: body.connectorId,
    connectorName: body.connectorName,
    status: body.status,
  })

  return NextResponse.json(item)
}
