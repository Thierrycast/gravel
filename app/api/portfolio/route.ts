import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const snapshots = await prisma.portfolioSnapshot.findMany({
    orderBy: { date: "asc" },
  })

  return NextResponse.json(snapshots)
}
