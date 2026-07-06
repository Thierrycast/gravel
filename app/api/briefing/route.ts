import { NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { getProjectionPayload } from "@/lib/domain/derived"
import { getCardStatementsSummaryMetrics } from "@/lib/domain/billing"
import { serializeForJson } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET() {
  const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })
  if (!settings?.anthropicApiKey) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 400 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [projection, bills, activeGoals] = await Promise.all([
    getProjectionPayload(),
    getCardStatementsSummaryMetrics(),
    prisma.goal.findMany({
      where: { active: true },
      select: { name: true, targetAmount: true, currentAmount: true },
    }),
  ])

  const rawCategoryGroups = await prisma.domainTransaction.groupBy({
    by: ["domainCategoryId"],
    where: {
      direction: "OUTFLOW",
      ignored: false,
      occurredAt: { gte: thirtyDaysAgo },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 5,
  })

  const categoryIds = rawCategoryGroups
    .map((r) => r.domainCategoryId)
    .filter((id): id is string => id !== null)

  const categories = await prisma.domainCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  })
  const catMap = new Map(categories.map((c) => [c.id, c.name]))

  const topSpend = rawCategoryGroups
    .map((r) => ({
      category: catMap.get(r.domainCategoryId ?? "") ?? "Sem categoria",
      amount: Math.abs(Number(r._sum.amount ?? 0)),
    }))
    .filter((r) => r.amount > 0)

  const { summary } = projection
  const monthName = now.toLocaleString("pt-BR", { month: "long", year: "numeric" })

  const goalLines =
    activeGoals.length === 0
      ? "Nenhuma meta cadastrada."
      : activeGoals
          .map((g) => {
            const pct = Math.min(
              100,
              (Number(g.currentAmount) / Number(g.targetAmount)) * 100,
            ).toFixed(0)
            return `- ${g.name}: ${pct}% concluída`
          })
          .join("\n")

  const prompt = `Você é um assistente financeiro pessoal. Gere um briefing financeiro conciso e útil para o mês de ${monthName} com base nos dados abaixo. Escreva em português, em tom direto e profissional, sem jargões excessivos. Máximo de 5 parágrafos curtos. Destaque o que é mais relevante para o usuário agir agora.

DADOS DO MÊS:
- Receita média mensal: R$ ${summary.averageMonthlyIncome.toFixed(2)}
- Despesas médias mensais: R$ ${summary.averageMonthlyExpenses.toFixed(2)}
- Comprometimento com metas: R$ ${summary.goalCommitmentMonthly.toFixed(2)}/mês
- Primeiro mês com saldo negativo projetado: ${summary.firstNegativeMonth ?? "nenhum nos próximos meses"}
- Faturas de cartão em atraso: ${bills.counts.overdue}
- Faturas a vencer em 7 dias: ${bills.counts.open}

TOP 5 CATEGORIAS DE GASTO (últimos 30 dias):
${topSpend.map((s, i) => `${i + 1}. ${s.category}: R$ ${s.amount.toFixed(2)}`).join("\n")}

METAS ATIVAS:
${goalLines}

Gere o briefing agora:`

  const client = new Anthropic({ apiKey: settings.anthropicApiKey })
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  })

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")

  return NextResponse.json(
    serializeForJson({ text, generatedAt: now.toISOString() }),
    { headers: { "Cache-Control": "max-age=86400, s-maxage=86400" } },
  )
}
