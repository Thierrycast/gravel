import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchAccountsMock = vi.fn()
const fetchItemMock = vi.fn()
const fetchTransactionsByCursorMock = vi.fn()
const resolveStoredPluggyItemIdsMock = vi.fn()

vi.mock("@/lib/integrations/pluggy", () => ({
  fetchAccounts: (...args: unknown[]) => fetchAccountsMock(...args),
  fetchItem: (...args: unknown[]) => fetchItemMock(...args),
  fetchTransactionsByCursor: (...args: unknown[]) => fetchTransactionsByCursorMock(...args),
}))

vi.mock("@/lib/pluggy-items", () => ({
  resolveStoredPluggyItemIds: (...args: unknown[]) => resolveStoredPluggyItemIdsMock(...args),
}))

import { GET } from "./route"

describe("GET /api/pluggy/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveStoredPluggyItemIdsMock.mockResolvedValue(["item-example"])
    fetchItemMock.mockResolvedValue({ status: "UPDATED" })
    fetchAccountsMock.mockResolvedValue({ results: [{ id: "account-example" }] })
    fetchTransactionsByCursorMock.mockResolvedValue({
      results: [{ id: "transaction-example" }],
      next: "?accountId=account-example&after=next-cursor",
    })
  })

  it("continues a selected account with the v2 cursor and date filters", async () => {
    const request = new Request(
      "http://localhost/api/pluggy/transactions?accountId=account-example&after=cursor-1&from=2026-10-01&to=2026-10-28",
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(fetchTransactionsByCursorMock).toHaveBeenCalledWith({
      accountId: "account-example",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-28",
      after: "cursor-1",
    })
    expect(await response.json()).toMatchObject({
      totalTransactions: 1,
      pagesByAccount: [{ accountId: "account-example", page: { next: "?accountId=account-example&after=next-cursor" } }],
    })
  })

  it("rejects page pagination before calling Pluggy", async () => {
    const response = await GET(new Request("http://localhost/api/pluggy/transactions?page=2"))

    expect(response.status).toBe(400)
    expect(fetchTransactionsByCursorMock).not.toHaveBeenCalled()
  })
})
