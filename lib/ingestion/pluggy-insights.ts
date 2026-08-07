import { getApiKey } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

/**
 * Insights API da Pluggy (serviço separado da API principal).
 *
 * Usamos só a **análise de renda** (`POST /income`): ela devolve a renda média
 * mensal detectada nas contas conectadas, o que serve para conferir o
 * `monthlySalary` configurado à mão. O "book of variables" (`POST /book`) é um
 * conjunto de KPIs de crédito — não tem uso num app de finanças pessoais.
 *
 * ⚠️ Nem toda aplicação tem o produto liberado. Quando não tem, a API responde
 * 400 `"Report creation is not enabled right now"` — tratado como
 * indisponibilidade, não como erro.
 */

const INSIGHTS_BASE =
  process.env.PLUGGY_INSIGHTS_API_BASE ?? "https://insights-api.pluggy.ai"

function getHeaderName() {
  return process.env.PLUGGY_API_KEY_HEADER ?? "X-API-KEY"
}

export type IncomeStatistics = {
  daysCoveredWithIncome?: number
  firstIncomeDate?: string
  lastIncomeDate?: string
  numIncomeTransactions?: number
  averageMonthlyIncomeLast30Days?: number
  averageMonthlyIncomeLast90Days?: number
  averageMonthlyIncomeLast180Days?: number
  averageMonthlyIncomeLast360Days?: number
}

export type IncomeReport = {
  status?: string
  itemId?: string
  result?: {
    totalIncomeStatistics?: IncomeStatistics
    irregularIncomeStatistics?: IncomeStatistics
    incomeSources?: Array<{
      transactionDescription?: string
      incomeStatistics?: IncomeStatistics
      aggregatedIncomeStatistics?: { averageMonthlyIncome?: number }
    }>
  }
}

export type IncomeAnalysis =
  | { available: false; reason: string }
  | {
      available: true
      itemId: string
      /** Renda média mensal considerando os últimos 90 dias. */
      averageMonthlyIncome: number | null
      lastIncomeDate: string | null
      sources: Array<{ description: string; averageMonthlyIncome: number | null }>
      report: IncomeReport
    }

/**
 * Análise de renda de um item. Devolve `available: false` com o motivo quando o
 * produto não está habilitado ou o conector não dá suporte — o chamador decide se
 * mostra ou ignora.
 */
export async function fetchIncomeAnalysis(
  itemExternalId: string,
): Promise<IncomeAnalysis> {
  const apiKey = await getApiKey()
  const response = await fetch(
    `${INSIGHTS_BASE}/income?itemId=${encodeURIComponent(itemExternalId)}`,
    {
      method: "POST",
      headers: { [getHeaderName()]: apiKey },
      cache: "no-store",
    },
  )

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message =
      typeof body?.message === "string"
        ? body.message
        : `Insights API respondeu ${response.status}`
    return { available: false, reason: message }
  }

  const report = (await response.json()) as IncomeReport
  const total = report.result?.totalIncomeStatistics

  return {
    available: true,
    itemId: itemExternalId,
    averageMonthlyIncome: total?.averageMonthlyIncomeLast90Days ?? null,
    lastIncomeDate: total?.lastIncomeDate ?? null,
    sources: (report.result?.incomeSources ?? []).map((source) => ({
      description: source.transactionDescription ?? "—",
      averageMonthlyIncome:
        source.aggregatedIncomeStatistics?.averageMonthlyIncome ??
        source.incomeStatistics?.averageMonthlyIncomeLast90Days ??
        null,
    })),
    report,
  }
}

/**
 * Roda a análise em todos os items e agrega a renda detectada, para comparar com
 * o `monthlySalary` configurado em /settings.
 */
export async function analyzeIncomeAcrossItems() {
  const items = await prisma.pluggyItem.findMany({
    where: { deletedAt: null },
    select: { pluggyItemId: true, connectorName: true },
  })

  const analyses: Array<
    IncomeAnalysis & { institution: string | null }
  > = []

  for (const item of items) {
    const analysis = await fetchIncomeAnalysis(item.pluggyItemId).catch(
      (error): IncomeAnalysis => ({
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      }),
    )
    analyses.push({ ...analysis, institution: item.connectorName })
  }

  const detected = analyses
    .filter((analysis) => analysis.available)
    .map((analysis) => (analysis.available ? analysis.averageMonthlyIncome : null))
    .filter((value): value is number => typeof value === "number")

  const settings = await prisma.userSetting.findFirst({
    select: { monthlySalary: true },
  })

  return {
    detectedMonthlyIncome:
      detected.length > 0 ? detected.reduce((sum, value) => sum + value, 0) : null,
    configuredMonthlySalary: settings?.monthlySalary
      ? Number(settings.monthlySalary)
      : null,
    unavailable: analyses
      .filter((analysis) => !analysis.available)
      .map((analysis) => ({
        institution: analysis.institution,
        reason: analysis.available ? null : analysis.reason,
      })),
    analyses,
  }
}
