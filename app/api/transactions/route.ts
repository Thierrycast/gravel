import { NextResponse } from "next/server"

import { getDashboardTransactions } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (!searchParams.has("pageSize")) {
    searchParams.set("pageSize", "1000")
  }
  const payload = await getDashboardTransactions(searchParams)
  return NextResponse.json(payload.results)
}
