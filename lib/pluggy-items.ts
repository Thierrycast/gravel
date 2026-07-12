import { prisma } from "@/lib/prisma"

type SavePluggyItemInput = {
  itemId: string
  connectorId?: number | null
  connectorName?: string | null
  imageUrl?: string | null
  status?: string | null
}

export async function listStoredPluggyItems() {
  return prisma.pluggyItem.findMany({
    orderBy: [{ createdAt: "desc" }],
  })
}

export async function savePluggyItem(input: SavePluggyItemInput) {
  const current = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: input.itemId },
  })

  let finalName = input.connectorName
  let finalId = input.connectorId
  let finalImageUrl = input.imageUrl

  if (
    finalName &&
    ["Pluggy", "MeuPluggy", "PLUGGY"].includes(finalName) &&
    current?.connectorName &&
    !["Pluggy", "MeuPluggy", "PLUGGY"].includes(current.connectorName)
  ) {
    finalName = current.connectorName
    finalId = current.connectorId
    finalImageUrl = current.imageUrl
  }

  await prisma.pluggyItem.upsert({
    where: { pluggyItemId: input.itemId },
    update: {
      connectorId: finalId ?? undefined,
      connectorName: finalName ?? undefined,
      imageUrl: finalImageUrl ?? undefined,
      status: input.status ?? undefined,
    },
    create: {
      pluggyItemId: input.itemId,
      connectorId: finalId ?? undefined,
      connectorName: finalName ?? undefined,
      imageUrl: finalImageUrl ?? undefined,
      status: input.status ?? undefined,
    },
  })

  return prisma.pluggyItem.findUnique({
    where: { pluggyItemId: input.itemId },
  })
}

export async function updateStoredPluggyItem(input: SavePluggyItemInput) {
  const current = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: input.itemId },
  })

  let finalName = input.connectorName
  let finalId = input.connectorId
  let finalImageUrl = input.imageUrl

  if (
    finalName &&
    ["Pluggy", "MeuPluggy", "PLUGGY"].includes(finalName) &&
    current?.connectorName &&
    !["Pluggy", "MeuPluggy", "PLUGGY"].includes(current.connectorName)
  ) {
    finalName = current.connectorName
    finalId = current.connectorId
    finalImageUrl = current.imageUrl
  }

  return prisma.pluggyItem.update({
    where: { pluggyItemId: input.itemId },
    data: {
      connectorId: finalId ?? undefined,
      connectorName: finalName ?? undefined,
      imageUrl: finalImageUrl ?? undefined,
      status: input.status ?? undefined,
    },
  })
}

export async function deletePluggyItem(pluggyItemId: string) {
  await prisma.pluggyItem.delete({
    where: { pluggyItemId },
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