import { NextResponse } from "next/server"

import { getProjectionPayload } from "@/lib/domain/derived"
import { serializeForJson } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const payload = await getProjectionPayload(searchParams)
  return NextResponse.json(serializeForJson(payload))
}
