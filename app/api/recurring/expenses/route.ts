import { NextResponse } from "next/server"

import { getRecurringPayload, refreshRecurringDerived } from "@/lib/domain/derived"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const existing = await prisma.domainRecurringRule.count({ where: { active: true } })
  if (existing === 0) {
    await refreshRecurringDerived()
  }

  const recurring = await getRecurringPayload("EXPENSE")
  return NextResponse.json(recurring)
}
