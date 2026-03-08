import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const assets = await prisma.cryptoAsset.findMany({
    orderBy: { symbol: "asc" },
  })

  return NextResponse.json(assets)
}
