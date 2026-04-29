import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const states = await prisma.domainSyncState.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10
  })

  return NextResponse.json(states)
}
