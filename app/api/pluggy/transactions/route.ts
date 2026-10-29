import { NextResponse } from "next/server"

import { fetchAccounts, fetchItem, fetchTransactionsByCursor } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds } from "@/lib/pluggy-items"

export const dynamic = "force-dynamic"

function isReady(status?: string) {
  return status === "UPDATED"
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  if (searchParams.has("page") || searchParams.has("pageSize")) {
    return NextResponse.json(
      { error: "Paginação por página não é suportada. Use accountId e after para continuar pela v2." },
      { status: 400 },
    )
  }

  const selectedAccountId = searchParams.get("accountId")
  const after = searchParams.get("after")
  if (after && !selectedAccountId) {
    return NextResponse.json(
      { error: "accountId é obrigatório ao informar after." },
      { status: 400 },
    )
  }
  const itemIds = await resolveStoredPluggyItemIds(searchParams.get("itemId"))

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "Nenhum item Pluggy salvo" },
      { status: 400 }
    )
  }

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
      accounts: await fetchAccounts({ itemId: item.itemId }),
    }))
  )

  const accountEntries = accountsByItem.flatMap((entry) => {
    const results = Array.isArray(entry.accounts?.results) ? entry.accounts.results : []
    return results.map((account: { id: string }) => ({
      itemId: entry.itemId,
      accountId: account.id,
    }))
  })

  if (selectedAccountId && !accountEntries.some((account) => account.accountId === selectedAccountId)) {
    return NextResponse.json({ error: "Conta Pluggy não encontrada nos items selecionados." }, { status: 404 })
  }

  const selectedAccounts = selectedAccountId
    ? accountEntries.filter((account) => account.accountId === selectedAccountId)
    : accountEntries
  const transactionsByAccount = await Promise.all(
    selectedAccounts.map(async (account) => ({
      itemId: account.itemId,
      accountId: account.accountId,
      page: await fetchTransactionsByCursor({
        accountId: account.accountId,
        dateFrom: from,
        dateTo: to,
        after,
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
