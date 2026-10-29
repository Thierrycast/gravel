import { z } from "zod"

import { positiveMoney, validationError } from "@/lib/core/money"
import { jsonError, jsonOk } from "@/lib/core/http"
import { getBudgetsProgress, upsertBudget } from "@/lib/domain/budgets"

export const dynamic = "force-dynamic"

const alertAtPercentSchema = z.number().int().min(1).max(100)

const createBudgetSchema = z.object({
  categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
  monthlyLimit: positiveMoney,
  alertAtPercent: alertAtPercentSchema.optional(),
})

export async function GET() {
  try {
    const payload = await getBudgetsProgress()
    return jsonOk({ summary: payload.summary, results: payload.results, meta: { month: payload.month, monthElapsedPercent: payload.monthElapsedPercent } })
  } catch (error) {
    return jsonError(error)
  }
}

/** Cria o orçamento da categoria; se ela já tinha um (mesmo inativo), substitui. */
export async function POST(request: Request) {
  try {
    const parsed = createBudgetSchema.safeParse(await request.json())
    if (!parsed.success) return jsonError(validationError(parsed.error), 400)
    const { categoryId, monthlyLimit, alertAtPercent } = parsed.data

    const budget = await upsertBudget({ categoryId, monthlyLimit, alertAtPercent })
    return jsonOk({ results: budget })
  } catch (error) {
    return jsonError(error, error instanceof Error && error.message === "Categoria não encontrada." ? 404 : 500)
  }
}
