import { NextResponse } from "next/server"

import { fetchAccounts, fetchItem, fetchTransactions } from "@/lib/integrations/pluggy"
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
  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined

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
  const accountsByItem = await Promise.all(
    readyItems.map(async (item) => ({
      itemId: item.itemId,
      accounts: await fetchAccounts(item.itemId),
    }))
  )

  const accountEntries = accountsByItem.flatMap((entry) => {
    const results = Array.isArray(entry.accounts?.results) ? entry.accounts.results : []
    return results.map((account: { id: string }) => ({
      itemId: entry.itemId,
      accountId: account.id,
    }))
  })

  const transactionsByAccount = await Promise.all(
    accountEntries.map(async (account) => ({
      itemId: account.itemId,
      accountId: account.accountId,
      page: await fetchTransactions({
        accountId: account.accountId,
        page,
        pageSize,
        from,
        to,
      }),
    }))
  )

  const results = transactionsByAccount.flatMap((entry) =>
    Array.isArray(entry.page?.results) ? entry.page.results : []
  )

  return NextResponse.json({
    items,
    totalItems: items.length,
    readyItems: readyItems.length,
    totalAccounts: accountEntries.length,
    totalTransactions: results.length,
    results,
    pagesByAccount: transactionsByAccount,
  })
}
