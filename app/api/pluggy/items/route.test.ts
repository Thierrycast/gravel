import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchItemMock = vi.fn()
const getApiKeyMock = vi.fn()
const listStoredPluggyItemsMock = vi.fn()
const updateStoredPluggyItemMock = vi.fn()

vi.mock("@/lib/integrations/pluggy", () => ({
  fetchAccounts: vi.fn(),
  fetchItem: (itemId: string) => fetchItemMock(itemId),
  getApiKey: () => getApiKeyMock(),
  getPluggyErrorDetails: vi.fn(),
}))

vi.mock("@/lib/pluggy-items", () => ({
  listStoredPluggyItems: () => listStoredPluggyItemsMock(),
  savePluggyItem: vi.fn(),
  updateStoredPluggyItem: (input: unknown) => updateStoredPluggyItemMock(input),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pluggyIdentityRecord: { findMany: vi.fn().mockResolvedValue([]) },
    pluggyConsentRecord: { findMany: vi.fn().mockResolvedValue([]) },
    pluggyConnectorStatus: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import { GET } from "./route"

describe("GET /api/pluggy/items", () => {
  beforeEach(() => {
    fetchItemMock.mockReset()
    getApiKeyMock.mockReset()
    listStoredPluggyItemsMock.mockReset()
    updateStoredPluggyItemMock.mockReset()
  })

  it("returns the preserved institution instead of the generic live proxy name", async () => {
    getApiKeyMock.mockResolvedValue("test-api-key")
    listStoredPluggyItemsMock.mockResolvedValue([
      {
        id: "stored-item",
        pluggyItemId: "item-1",
        connectorId: 123,
        connectorName: "Banco Exemplo",
        imageUrl: "https://example.test/banco.png",
        status: "UPDATED",
        executionStatus: null,
        nextAutoSyncAt: null,
        consentExpiresAt: null,
        syncError: null,
        lastSyncedAt: null,
      },
    ])
    fetchItemMock.mockResolvedValue({
      connector: { id: 999, name: "MeuPluggy", imageUrl: "https://example.test/proxy.png" },
      status: "UPDATED",
    })
    updateStoredPluggyItemMock.mockResolvedValue({
      id: "stored-item",
      pluggyItemId: "item-1",
      connectorId: 123,
      connectorName: "Banco Exemplo",
      imageUrl: "https://example.test/banco.png",
      status: "UPDATED",
      executionStatus: null,
      nextAutoSyncAt: null,
      consentExpiresAt: null,
      syncError: null,
      lastSyncedAt: null,
    })

    const response = await GET()
    const payload = (await response.json()) as { items: Array<{ connectorName: string; connectorId: number }> }

    expect(payload.items[0]).toMatchObject({
      connectorName: "Banco Exemplo",
      connectorId: 123,
    })
  })
})
