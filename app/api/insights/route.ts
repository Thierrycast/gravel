import { NextResponse } from "next/server"
import { getBehavioralNudges } from "@/lib/domain/ai-engine"
import { checkBenfordsLaw, detectHiddenSubscriptions } from "@/lib/domain/forensics"
import { getCardStatements } from "@/lib/domain/billing"
import { getProjectionPayload } from "@/lib/domain/derived"
import { serializeForJson } from "@/lib/core/http"

export const dynamic = "force-dynamic"

type InsightAction = {
  id: string
  severity: "critical" | "warning" | "info"
  title: string
  message: string
  href: string
  hrefLabel: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Ações recomendadas: cruzam o motor de faturas e a projeção para gerar uma
 * lista priorizada do que o usuário deve fazer agora, com link direto.
 */
async function buildActions(): Promise<InsightAction[]> {
  const now = new Date()
  const [statements, projection] = await Promise.all([
    getCardStatements({ now }),
    getProjectionPayload(new URLSearchParams("months=6")),
  ])

  const actions: InsightAction[] = []

  for (const card of statements) {
    if (!card.configured) {
      actions.push({
        id: `configure:${card.accountId}`,
        severity: "info",
        title: `Configure o ciclo do cartão ${card.accountName.trim()}`,
        message:
          "Sem o dia de fechamento e vencimento, as faturas deste cartão usam estimativas.",
        href: "/settings",
        hrefLabel: "Configurar",
      })
      continue
    }
    for (const statement of card.past) {
      if (statement.status === "OVERDUE") {
        actions.push({
          id: `overdue:${statement.id}`,
          severity: "critical",
          title: `Fatura vencida no ${card.accountName.trim()}`,
          message: `R$ ${statement.amount.toFixed(2)} venceu em ${new Date(statement.dueDate).toLocaleDateString("pt-BR")}.`,
          href: "/bills",
          hrefLabel: "Ver faturas",
        })
      }
    }
    const current = card.current
    if (current && current.amount > 0 && current.status !== "PAID") {
      const daysToDue = Math.ceil(
        (new Date(current.dueDate).getTime() - now.getTime()) / DAY_MS,
      )
      if (daysToDue >= 0 && daysToDue <= 7) {
        actions.push({
          id: `due-soon:${current.id}`,
          severity: "warning",
          title: `Fatura do ${card.accountName.trim()} vence ${daysToDue === 0 ? "hoje" : `em ${daysToDue} dia${daysToDue > 1 ? "s" : ""}`}`,
          message: `Valor atual: R$ ${current.amount.toFixed(2)}.`,
          href: "/bills",
          hrefLabel: "Ver fatura",
        })
      }
    }
  }

  const summary = projection.summary
  if (summary.firstNegativeMonth) {
    actions.push({
      id: "negative-balance",
      severity: "critical",
      title: `Saldo projetado fica negativo em ${summary.firstNegativeMonth}`,
      message:
        "Com as receitas e despesas conhecidas, o saldo cruza o zero dentro do horizonte de 6 meses.",
      href: "/projection",
      hrefLabel: "Ver projeção",
    })
  }
  const avgNet = summary.averageMonthlyIncome - summary.averageMonthlyExpenses
  if (
    summary.goalCommitmentMonthly > 0 &&
    avgNet < summary.goalCommitmentMonthly
  ) {
    actions.push({
      id: "goal-pace",
      severity: "warning",
      title: "Sobra mensal não cobre os aportes das metas",
      message: `Metas pedem R$ ${summary.goalCommitmentMonthly.toFixed(2)}/mês; sobra média projetada é R$ ${Math.max(avgNet, 0).toFixed(2)}.`,
      href: "/goals",
      hrefLabel: "Rever metas",
    })
  }

  const order = { critical: 0, warning: 1, info: 2 } as const
  return actions.sort((a, b) => order[a.severity] - order[b.severity])
}

export async function GET() {
  const [nudges, benford, hiddenSubs, actions] = await Promise.all([
    getBehavioralNudges(),
    checkBenfordsLaw(),
    detectHiddenSubscriptions(),
    buildActions(),
  ])

  return NextResponse.json(serializeForJson({
    nudges,
    actions,
    forensics: {
      benford,
      hiddenSubs
    }
  }))
}
