import { NextResponse } from "next/server"

import { listStoredPluggyItems, savePluggyItem } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

export async function GET() {
  const items = await listStoredPluggyItems()
  return NextResponse.json(items)
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
