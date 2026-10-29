import { beforeEach, describe, expect, it, vi } from "vitest"

const findStoredItemMock = vi.fn()
const fetchItemResourcesMock = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pluggyItem: {
      findUnique: (...argumentsList: unknown[]) => findStoredItemMock(...argumentsList),
    },
  },
}))

vi.mock("@/lib/integrations/pluggy", () => ({
  fetchItemResources: (...argumentsList: unknown[]) => fetchItemResourcesMock(...argumentsList),
}))

import { GET } from "./route"

const request = new Request("http://localhost/api/pluggy/items/item-example/resources")
const context = { params: Promise.resolve({ itemId: "item-example" }) }

describe("GET /api/pluggy/items/[itemId]/resources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findStoredItemMock.mockResolvedValue({ id: "stored-item" })
  })

  it("does not query Pluggy for an item absent from the local app", async () => {
    findStoredItemMock.mockResolvedValue(null)

    const response = await GET(request, context)

    expect(response.status).toBe(404)
    expect(fetchItemResourcesMock).not.toHaveBeenCalled()
  })

  it("aggregates attention states across pages without returning resource IDs", async () => {
    fetchItemResourcesMock
      .mockResolvedValueOnce({
        totalPages: 2,
        results: [
          { resourceId: "private-1", type: "ACCOUNT", status: "PENDING_AUTHORISATION" },
          { resourceId: "private-2", type: "FUND", status: "AVAILABLE" },
        ],
      })
      .mockResolvedValueOnce({
        totalPages: 2,
        results: [
          { resourceId: "private-3", type: "ACCOUNT", status: "PENDING_AUTHORISATION" },
          { resourceId: "private-4", type: "FUND", status: "UNAVAILABLE" },
        ],
      })

    const response = await GET(request, context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(fetchItemResourcesMock).toHaveBeenNthCalledWith(1, "item-example", { page: 1 })
    expect(fetchItemResourcesMock).toHaveBeenNthCalledWith(2, "item-example", { page: 2 })
    expect(body).toEqual({
      groups: [
        { type: "ACCOUNT", status: "PENDING_AUTHORISATION", count: 2 },
        { type: "FUND", status: "UNAVAILABLE", count: 1 },
      ],
      partial: false,
    })
    expect(JSON.stringify(body)).not.toContain("private-")
  })
})
