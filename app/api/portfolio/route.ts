import { NextResponse } from "next/server"

import { getPortfolioPayload } from "@/lib/domain/derived"

export const dynamic = "force-dynamic"

export async function GET() {
  const payload = await getPortfolioPayload()
  return NextResponse.json(payload)
}
