import { NextResponse } from "next/server"

import { fetchLoans } from "@/lib/integrations/pluggy"
import {
  parseNumberParam,
  resolveLivePluggyItems,
} from "@/lib/pluggy-route-helpers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseNumberParam(searchParams.get("page"))
  const pageSize = parseNumberParam(searchParams.get("pageSize"))
  const { items, readyItems } = await resolveLivePluggyItems(
    searchParams.get("itemId")
  )

  const pagesByItem = await Promise.all(
    readyItems.map(async (item) => ({
      itemId: item.itemId,
      page: await fetchLoans({
        itemId: item.itemId,
        page,
        pageSize,
      }),
    }))
  )

  const results = pagesByItem.flatMap((entry) =>
    Array.isArray(entry.page?.results) ? entry.page.results : []
  )

  return NextResponse.json({
    items,
    totalItems: items.length,
    readyItems: readyItems.length,
    totalLoans: results.length,
    results,
    pagesByItem,
  })
}
