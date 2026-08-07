import { jsonError, jsonOk } from "@/lib/core/http"
import { analyzeIncomeAcrossItems } from "@/lib/ingestion/pluggy-insights"

export const dynamic = "force-dynamic"

/**
 * Renda detectada pela Insights API da Pluggy vs. o salário configurado à mão.
 * Serve para conferir o `monthlySalary` de /settings sem contar transação a mão.
 *
 * O produto pode não estar habilitado na aplicação Pluggy; nesse caso a resposta
 * traz `unavailable` com o motivo, e não um erro.
 */
export async function GET() {
  try {
    const analysis = await analyzeIncomeAcrossItems()

    return jsonOk({
      summary: {
        detectedMonthlyIncome: analysis.detectedMonthlyIncome,
        configuredMonthlySalary: analysis.configuredMonthlySalary,
        available: analysis.detectedMonthlyIncome !== null,
      },
      results: analysis,
    })
  } catch (error) {
    return jsonError(error)
  }
}
