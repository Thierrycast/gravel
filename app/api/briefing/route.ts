import { createHash } from "node:crypto"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateAiText, type AiProviderKind } from "@/lib/ai/provider"
import { getProjectionPayload } from "@/lib/domain/derived"
import { getCardStatementsSummaryMetrics } from "@/lib/domain/billing"
import { serializeForJson } from "@/lib/core/http"
import { getManagedSecretValue } from "@/lib/server/secret-store"

export const dynamic = "force-dynamic"

/**
 * Briefings já gerados, por impressão digital dos dados de entrada.
 *
 * Em memória de propósito: é um dashboard de um usuário só, e o desperdício
 * real é reabrir a página cinco vezes na mesma tarde e pagar cinco gerações
 * idênticas. Perder o cache num restart não custa nada — a próxima requisição
 * regenera. Uma tabela no banco resolveria o mesmo problema com uma migração
 * a mais e nenhum ganho prático aqui.
 */
const BRIEFING_CACHE_MAX = 8
const briefingCache = new Map<string, { text: string; generatedAt: string }>()

function rememberBriefing(key: string, value: { text: string; generatedAt: string }) {
  if (briefingCache.size >= BRIEFING_CACHE_MAX) {
    const oldest = briefingCache.keys().next().value
    if (oldest !== undefined) briefingCache.delete(oldest)
  }
  briefingCache.set(key, value)
}

export async function GET() {
  const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })
  const managedSecret = await getManagedSecretValue("AI_API_KEY")
  const apiKey = managedSecret.value || settings?.anthropicApiKey
  if (!apiKey) {
    return NextResponse.json({ error: "api_key_missing" }, { status: 400 })
  }

  let aiConfig: { provider?: AiProviderKind; baseUrl?: string; model?: string } = {}
  try {
    aiConfig = JSON.parse(settings?.dashboardConfigJson || "{}").ai || {}
  } catch {}

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

  // O cabeçalho antes dizia "DADOS DO MÊS" sobre uma lista de MÉDIAS, e o
  // modelo fazia o que era de esperar: apresentava a média como o realizado.
  // Saiu num briefing de verdade — "Seu saldo projetado para setembro é
  // positivo em R$ 1.309,49 (receita de R$ 3.411,74 menos despesas de
  // R$ 2.102,25)" — em que os dois números são médias históricas, não setembro.
  // Em texto sobre dinheiro isso não é imprecisão de estilo, é erro material.
  //
  // Cada número agora diz o que é, e a regra proíbe derivar valores novos: se
  // o saldo projetado não foi calculado aqui, o modelo não pode inventá-lo
  // subtraindo duas médias.
  const prompt = `Você é um assistente financeiro pessoal. Gere um briefing conciso e útil, em português, tom direto e profissional, sem jargão. Máximo de 5 parágrafos curtos. Destaque o que exige ação agora.

REGRAS SOBRE OS NÚMEROS — siga à risca:
- Use apenas os valores listados abaixo, com o rótulo que eles têm.
- MÉDIA HISTÓRICA não é o valor do mês corrente. Nunca escreva "sua receita de ${monthName} foi X" a partir de uma média; escreva "sua receita média mensal é X".
- Não calcule valores que não estão aqui (saldos, sobras, percentuais, projeções). Se um número não foi dado, não o mencione.
- Se algo importante estiver ausente ou zerado, diga isso em vez de estimar.

MÉDIAS HISTÓRICAS (não são o realizado de ${monthName}):
- Receita média mensal: R$ ${summary.averageMonthlyIncome.toFixed(2)}
- Despesas médias mensais: R$ ${summary.averageMonthlyExpenses.toFixed(2)}
- Comprometimento com metas: R$ ${summary.goalCommitmentMonthly.toFixed(2)}/mês

PROJEÇÃO:
- Primeiro mês com saldo negativo projetado: ${summary.firstNegativeMonth ?? "nenhum nos próximos meses"}

SITUAÇÃO ATUAL (contagens reais de hoje):
- Faturas de cartão em atraso: ${bills.counts.overdue}
- Faturas a vencer em 7 dias: ${bills.counts.open}

GASTO REALIZADO NOS ÚLTIMOS 30 DIAS — TOP 5 CATEGORIAS:
${topSpend.length === 0 ? "Nenhum gasto categorizado no período." : topSpend.map((s, i) => `${i + 1}. ${s.category}: R$ ${s.amount.toFixed(2)}`).join("\n")}

METAS ATIVAS:
${goalLines}

Gere o briefing agora:`

  // Os defaults vêm do ambiente para o provider padrão do lab (OmniRoute) não
  // ficar fixo em código: o que estiver salvo em /settings sempre vence.
  const envProvider = process.env.AI_PROVIDER === "openai-compatible" ? "openai-compatible" : undefined
  const provider = aiConfig.provider || envProvider || "anthropic"
  const fallbackModel =
    process.env.AI_MODEL?.trim() ||
    (provider === "anthropic" ? "claude-haiku-4-5-20251001" : "local-default")
  // Mesmos dados, mesmo briefing: não há motivo para pagar uma geração nova a
  // cada vez que o dashboard é aberto. O `Cache-Control` abaixo só instrui o
  // navegador; toda requisição que CHEGA aqui gerava de novo, porque a rota é
  // `force-dynamic`. A chave é a impressão digital do que entra no prompt —
  // mudou um número, o briefing é refeito.
  const fingerprint = createHash("sha256").update(prompt).digest("hex")
  const cached = briefingCache.get(fingerprint)
  if (cached) {
    return NextResponse.json(
      serializeForJson({ text: cached.text, generatedAt: cached.generatedAt, cached: true }),
      { headers: { "Cache-Control": "max-age=86400, s-maxage=86400" } },
    )
  }

  let text: string
  try {
    text = await generateAiText(
      {
        kind: provider,
        apiKey,
        baseUrl: aiConfig.baseUrl || process.env.AI_BASE_URL?.trim() || undefined,
        model: aiConfig.model || fallbackModel,
      },
      prompt
    )
  } catch (error) {
    // Provider fora do ar não pode virar stack trace de 500 na tela. O formato
    // segue o de `api_key_missing`, que a UI já sabe tratar.
    return NextResponse.json(
      {
        error: "ai_provider_failed",
        detail: error instanceof Error ? error.message : "Falha desconhecida no provider.",
      },
      { status: 502 },
    )
  }

  const generatedAt = now.toISOString()
  rememberBriefing(fingerprint, { text, generatedAt })

  return NextResponse.json(
    serializeForJson({ text, generatedAt, cached: false }),
    { headers: { "Cache-Control": "max-age=86400, s-maxage=86400" } },
  )
}
