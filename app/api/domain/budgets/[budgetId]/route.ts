import { z } from "zod"

import { positiveMoney, toMoneyDecimal, validationError } from "@/lib/core/money"
import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ budgetId: string }> }

const updateBudgetSchema = z
  .object({
    monthlyLimit: positiveMoney.optional(),
    alertAtPercent: z.number().int().min(1).max(100).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nada para atualizar")

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { budgetId } = await params
    const parsed = updateBudgetSchema.safeParse(await request.json())
    if (!parsed.success) return jsonError(validationError(parsed.error), 400)

    const existing = await prisma.domainBudget.findUnique({ where: { id: budgetId }, select: { id: true } })
    if (!existing) return jsonError(new Error("Orçamento não encontrado"), 404)

    const { monthlyLimit, ...rest } = parsed.data
    const budget = await prisma.domainBudget.update({
      where: { id: budgetId },
      data: { ...rest, ...(monthlyLimit !== undefined ? { monthlyLimit: toMoneyDecimal(monthlyLimit) } : {}) },
    })
    return jsonOk({ results: budget })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { budgetId } = await params
    const existing = await prisma.domainBudget.findUnique({ where: { id: budgetId }, select: { id: true } })
    if (!existing) return jsonError(new Error("Orçamento não encontrado"), 404)
    await prisma.domainBudget.delete({ where: { id: budgetId } })
    return jsonOk({ results: { id: budgetId, deleted: true } })
  } catch (error) {
    return jsonError(error)
  }
}
