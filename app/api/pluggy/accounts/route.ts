import { NextResponse } from "next/server"

import { fetchAccounts, fetchItem, getItemIdFromEnv } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

function isReady(status?: string) {
  return status === "UPDATED"
}

export async function GET() {
  const itemId = getItemIdFromEnv()
  const item = await fetchItem(itemId)

  if (!isReady(item?.status)) {
    return NextResponse.json(
      { status: item?.status ?? "UNKNOWN" },
      { status: 409 }
    )
  }

  const accounts = await fetchAccounts(itemId)
  return NextResponse.json(accounts)
}
