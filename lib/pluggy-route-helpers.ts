import { fetchAccounts, fetchItem } from "@/lib/integrations/pluggy"
import { resolveStoredPluggyItemIds } from "@/lib/pluggy-items"

export function isReady(status?: string) {
  return status === "UPDATED"
}

export function parseNumberParam(value: string | null) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function resolveLivePluggyItems(itemId?: string | null) {
  const itemIds = await resolveStoredPluggyItemIds(itemId)

  const items = await Promise.all(
    itemIds.map(async (currentItemId) => {
      const item = await fetchItem(currentItemId)
      return {
        itemId: currentItemId,
        status: item?.status ?? "UNKNOWN",
        connector: item?.connector ?? null,
      }
    })
  )

  return {
    itemIds,
    items,
    readyItems: items.filter((item) => isReady(item.status)),
  }
}

export async function resolveAccountsFromReadyItems(itemId?: string | null) {
  const { items, readyItems } = await resolveLivePluggyItems(itemId)

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
      account,
    }))
  })

  return {
    items,
    readyItems,
    accountsByItem,
    accountEntries,
  }
}
