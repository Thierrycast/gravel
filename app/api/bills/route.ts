import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const bills = await prisma.bill.findMany({
    orderBy: { dueDate: "asc" },
    include: { account: true },
  })

  return NextResponse.json(bills)
}
