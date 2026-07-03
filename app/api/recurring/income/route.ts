import { NextResponse } from "next/server"

import { getRecurringPayload, refreshRecurringDerived } from "@/lib/domain/derived"
import { monthlyEquivalentAmount } from "@/lib/domain/recurring"
import { serializeForJson } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const existing = await prisma.domainRecurringRule.count({ where: { active: true } })
  if (existing === 0) {
    await refreshRecurringDerived()
  }

  const rules = await getRecurringPayload("INCOME")
  const categories = await prisma.domainCategory.findMany()
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  const mapped = rules.map((r) => ({
    id: r.id,
    description: r.title,
    amount: r.amount,
    frequency: r.interval,
    category: r.categoryId ? categoryMap.get(r.categoryId) ?? "Sem categoria" : "Sem categoria",
    categoryId: r.categoryId,
    nextDate: r.nextDate,
    type: r.type,
    occurrences: r.occurrences ?? 0,
    lastDate: r.lastOccurrenceAt,
    confidence: r.confidence ?? 0,
    isManual: r.origin === "manual",
    origin: r.origin,
  }))

  // Total mensal correto soma o equivalente mensal de cada periodicidade
  // (semanal ≈ 4,33x, trimestral ÷ 3, anual ÷ 12).
  const summary = {
    totalMonthlyIncome: rules.reduce(
      (sum, r) =>
        sum + monthlyEquivalentAmount(Math.abs(Number(r.amount)), r.interval),
      0,
    ),
    count: rules.length,
  }

  return NextResponse.json(serializeForJson({ rules: mapped, summary }))
}
