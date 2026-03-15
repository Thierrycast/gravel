import { NextResponse } from "next/server"

import { getDomainCategories } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (!searchParams.has("pageSize")) {
    searchParams.set("pageSize", "500")
  }
  const payload = await getDomainCategories(searchParams)
  return NextResponse.json(payload.results)
}
