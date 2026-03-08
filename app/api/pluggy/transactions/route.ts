import { NextResponse } from "next/server"

import { fetchItem, fetchTransactions } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemId } from "@/lib/pluggy-items"

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

  const page = parseNumber(searchParams.get("page"))
  const pageSize = parseNumber(searchParams.get("pageSize"))

  const transactions = await fetchTransactions(itemId, { page, pageSize })
  return NextResponse.json(transactions)
}
