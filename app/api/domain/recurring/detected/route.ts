import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/domain/recurring/detected
 * Recorrências detectadas pela Pluggy (recurring-payments), separadas por
 * direção, com score de regularidade e ocorrências ligadas a transações reais.
 * Exclui as ocultadas pelo usuário por padrão (`?includeHidden=true` inclui).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeHidden = searchParams.get("includeHidden") === "true"

    const rows = await prisma.pluggyRecurringPayment.findMany({
      where: includeHidden ? {} : { userStatus: { not: "HIDDEN" } },
      orderBy: [{ regularityScore: "desc" }, { occurrences: "desc" }],
    })

    const mapped = rows.map((row) => ({
      id: row.id,
      description: row.description,
      averageAmount: Number(row.averageAmount.toString()),
      direction: row.direction,
      occurrences: row.occurrences,
      regularityScore: row.regularityScore
        ? Number(row.regularityScore.toString())
        : null,
      categoryName: row.categoryName,
      firstDate: row.firstDate,
      lastDate: row.lastDate,
      userStatus: row.userStatus,
      transactionIds: row.transactionIdsJson
        ? (JSON.parse(row.transactionIdsJson) as string[])
        : [],
    }))

    const income = mapped.filter((r) => r.direction === "INCOME")
    const expense = mapped.filter((r) => r.direction === "EXPENSE")

    return jsonOk({
      summary: {
        incomeCount: income.length,
        expenseCount: expense.length,
        // Média mensal aproximada (recorrências ~mensais).
        monthlyIncome: income.reduce((s, r) => s + Math.abs(r.averageAmount), 0),
        monthlyExpense: expense.reduce(
          (s, r) => s + Math.abs(r.averageAmount),
          0,
        ),
      },
      results: { income, expense },
    })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * PATCH /api/domain/recurring/detected
 * Confirma, oculta ou reabre uma recorrência detectada (decisão manual).
 */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      id?: string
      userStatus?: string
    }
    if (!body.id || !body.userStatus) {
      return jsonError(new Error("id e userStatus são obrigatórios"), 400)
    }
    if (!["SUGGESTED", "CONFIRMED", "HIDDEN"].includes(body.userStatus)) {
      return jsonError(new Error("userStatus inválido"), 400)
    }
    const updated = await prisma.pluggyRecurringPayment.update({
      where: { id: body.id },
      data: { userStatus: body.userStatus },
    })
    return jsonOk({ results: { id: updated.id, userStatus: updated.userStatus } })
  } catch (error) {
    return jsonError(error)
  }
}
