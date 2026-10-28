import { NextResponse } from "next/server"

import { fetchItemResources } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const MAX_PAGES = 20
const ATTENTION_STATUSES = new Set([
  "PENDING_AUTHORISATION",
  "UNAVAILABLE",
  "TEMPORARILY_UNAVAILABLE",
])

type ResourceGroup = {
  type: string
  status: string
  count: number
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params
  const storedItem = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: itemId },
    select: { id: true },
  })

  if (!storedItem) {
    return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 })
  }

  try {
    const groups = new Map<string, ResourceGroup>()
    let page = 1
    let totalPages = 1

    do {
      const payload = await fetchItemResources(itemId, { page })
      totalPages = Math.max(1, Number(payload?.totalPages) || 1)

      for (const resource of payload?.results ?? []) {
        if (!ATTENTION_STATUSES.has(resource.status)) continue
        const type = typeof resource.type === "string"
          ? resource.type.slice(0, 80)
          : "RECURSO"
        const key = `${resource.status}:${type}`
        const group = groups.get(key) ?? { type, status: resource.status, count: 0 }
        group.count += 1
        groups.set(key, group)
      }

      page += 1
    } while (page <= totalPages && page <= MAX_PAGES)

    return NextResponse.json({
      groups: Array.from(groups.values()),
      partial: totalPages > MAX_PAGES,
    })
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar os recursos do consentimento." },
      { status: 502 },
    )
  }
}
