import { NextResponse } from "next/server"

import { fetchBills } from "@/lib/integrations/pluggy"
import {
  parseNumberParam,
  resolveAccountsFromReadyItems,
} from "@/lib/pluggy-route-helpers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseNumberParam(searchParams.get("page"))
  const pageSize = parseNumberParam(searchParams.get("pageSize"))
  const { items, readyItems, accountEntries } = await resolveAccountsFromReadyItems(
    searchParams.get("itemId")
  )

  const pagesByAccount = await Promise.all(
    accountEntries.map(async (entry) => ({
      itemId: entry.itemId,
      accountId: entry.accountId,
      page: await fetchBills({
        accountId: entry.accountId,
        page,
        pageSize,
      }),
    }))
  )

  const results = pagesByAccount.flatMap((entry) =>
    Array.isArray(entry.page?.results) ? entry.page.results : []
  )

  return NextResponse.json({
    items,
    totalItems: items.length,
    readyItems: readyItems.length,
    totalAccounts: accountEntries.length,
    totalBills: results.length,
    results,
    pagesByAccount,
  })
}
