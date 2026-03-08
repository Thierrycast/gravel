import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const recurring = await prisma.recurringItem.findMany({
    where: { type: "INCOME" },
    orderBy: { nextDate: "asc" },
    include: { account: true },
  })

  return NextResponse.json(recurring)
}
