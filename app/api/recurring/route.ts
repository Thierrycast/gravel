import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const recurring = await prisma.recurringItem.findMany({
    orderBy: { nextDate: "asc" },
    include: { account: true },
  })

  return NextResponse.json(recurring)
}
