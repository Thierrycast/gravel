import { NextResponse } from "next/server"

import {
  getPluggyPersistenceSummary,
  syncPluggyData,
  type SyncResource,
} from "@/lib/pluggy-sync"

export const dynamic = "force-dynamic"

export async function GET() {
  const summary = await getPluggyPersistenceSummary()
  return NextResponse.json(summary)
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        itemId?: string | null
        resources?: SyncResource[]
        pageSize?: number
      }
    | null

  const summary = await syncPluggyData({
    itemId: body?.itemId ?? undefined,
    resources: Array.isArray(body?.resources) ? body.resources : undefined,
    pageSize:
      typeof body?.pageSize === "number" && body.pageSize > 0
        ? body.pageSize
        : undefined,
  })

  return NextResponse.json(summary)
}
