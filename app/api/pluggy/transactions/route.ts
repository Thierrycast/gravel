import { NextResponse } from "next/server"

import { fetchItem, fetchTransactions, getItemIdFromEnv } from "@/lib/integrations/pluggy"

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
  const itemId = getItemIdFromEnv()
  const item = await fetchItem(itemId)

  if (!isReady(item?.status)) {
    return NextResponse.json(
      { status: item?.status ?? "UNKNOWN" },
      { status: 409 }
    )
  }

  const { searchParams } = new URL(request.url)
  const page = parseNumber(searchParams.get("page"))
  const pageSize = parseNumber(searchParams.get("pageSize"))

  const transactions = await fetchTransactions(itemId, { page, pageSize })
  return NextResponse.json(transactions)
}
