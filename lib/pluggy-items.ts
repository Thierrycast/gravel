import { prisma } from "@/lib/prisma"

type SavePluggyItemInput = {
  itemId: string
  connectorId?: number | null
  connectorName?: string | null
  status?: string | null
}

export async function listStoredPluggyItems() {
  return prisma.pluggyItem.findMany({
    orderBy: [{ isSelected: "desc" }, { updatedAt: "desc" }],
  })
}

export async function savePluggyItem(input: SavePluggyItemInput) {
  await prisma.$transaction([
    prisma.pluggyItem.updateMany({
      data: { isSelected: false },
    }),
    prisma.pluggyItem.upsert({
      where: { pluggyItemId: input.itemId },
      update: {
        connectorId: input.connectorId ?? undefined,
        connectorName: input.connectorName ?? undefined,
        status: input.status ?? undefined,
        isSelected: true,
      },
      create: {
        pluggyItemId: input.itemId,
        connectorId: input.connectorId ?? undefined,
        connectorName: input.connectorName ?? undefined,
        status: input.status ?? undefined,
        isSelected: true,
      },
    }),
  ])

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

export async function resolveStoredPluggyItemId(itemId?: string | null) {
  if (itemId) {
    return itemId
  }

  const selected = await prisma.pluggyItem.findFirst({
    where: { isSelected: true },
    orderBy: { updatedAt: "desc" },
  })

  if (selected) {
    return selected.pluggyItemId
  }

  const latest = await prisma.pluggyItem.findFirst({
    orderBy: { updatedAt: "desc" },
  })

  return latest?.pluggyItemId ?? null
}
