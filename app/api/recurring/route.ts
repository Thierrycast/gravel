import { NextResponse } from "next/server"

import { getRecurringPayload, refreshRecurringDerived } from "@/lib/domain/derived"
import { serializeForJson } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const existing = await prisma.domainRecurringRule.count({ where: { active: true } })
  if (existing === 0) {
    await refreshRecurringDerived()
  }

  const rules = await getRecurringPayload()
  const categories = await prisma.domainCategory.findMany()
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  // Map to UI-expected field names
  const mapped: import("@/lib/types/api").RecurringRule[] = rules.map((r) => ({
    id: r.id,
    description: r.title,
    amount: Number(r.amount),
    frequency: r.interval,
    category: r.categoryId ? categoryMap.get(r.categoryId) ?? "Sem categoria" : "Sem categoria",
    categoryId: r.categoryId,
    nextDate: r.nextDate.toISOString(),
    type: r.type,
    occurrences: r.occurrences ?? 0,
    lastDate: r.lastOccurrenceAt?.toISOString() ?? null,
    confidence: r.confidence ?? 0,
    isManual: r.origin === "manual",
    origin: r.origin as "detected" | "manual",
  }))

  function normalizeMonthlyAmount(amount: number, interval: string): number {
    const value = Math.abs(amount)
    switch (interval.toUpperCase()) {
      case "WEEKLY": return value * 4.333
      case "BIWEEKLY": return value * 2.166
      case "MONTHLY": return value
      case "QUARTERLY": return value / 3
      case "YEARLY": return value / 12
      default: return value
    }
  }

  const summary = {
    totalMonthlyExpenses: rules
      .filter((r) => r.type === "EXPENSE")
      .reduce((sum, r) => sum + normalizeMonthlyAmount(Number(r.amount), r.interval), 0),
    totalMonthlyIncome: rules
      .filter((r) => r.type === "INCOME")
      .reduce((sum, r) => sum + normalizeMonthlyAmount(Number(r.amount), r.interval), 0),
    count: rules.length,
  }

  return NextResponse.json(serializeForJson({ rules: mapped, summary }))
}
