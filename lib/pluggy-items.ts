import { prisma } from "@/lib/prisma"

type SavePluggyItemInput = {
  itemId: string
  connectorId?: number | null
  connectorName?: string | null
  status?: string | null
}

export async function listStoredPluggyItems() {
  return prisma.pluggyItem.findMany({
    orderBy: [{ updatedAt: "desc" }],
  })
}

export async function savePluggyItem(input: SavePluggyItemInput) {
  await prisma.pluggyItem.upsert({
    where: { pluggyItemId: input.itemId },
    update: {
      connectorId: input.connectorId ?? undefined,
      connectorName: input.connectorName ?? undefined,
      status: input.status ?? undefined,
    },
    create: {
      pluggyItemId: input.itemId,
      connectorId: input.connectorId ?? undefined,
      connectorName: input.connectorName ?? undefined,
      status: input.status ?? undefined,
    },
  })

  return prisma.pluggyItem.findUnique({
    where: { pluggyItemId: input.itemId },
  })
}

export async function updateStoredPluggyItem(input: SavePluggyItemInput) {
  return prisma.pluggyItem.update({
    where: { pluggyItemId: input.itemId },
    data: {
      connectorId: input.connectorId ?? undefined,
      connectorName: input.connectorName ?? undefined,
      status: input.status ?? undefined,
    },
  })
}

export async function resolveStoredPluggyItemIds(itemId?: string | null) {
  if (itemId) {
    return [itemId]
  }

  const items = await prisma.pluggyItem.findMany({
    orderBy: { updatedAt: "desc" },
  })

  return items.map((currentItem) => currentItem.pluggyItemId)
}
