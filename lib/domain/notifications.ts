import * as fs from "fs"
import * as path from "path"
import { prisma } from "@/lib/prisma"
import { getProjectionPayload } from "@/lib/domain/derived"

const LOG_FILE_PATH = path.join(process.cwd(), ".agents", "logs", "notifications.log")

// Assegura que o diretório de logs existe
function ensureLogDir() {
  const dir = path.dirname(LOG_FILE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Trigger base de entrega de notificacoes.
 * Atualmente grava no log local e no console. Pronto para ser estendido para Slack/Telegram.
 */
export async function triggerNotificationDelivery(
  title: string,
  message: string,
  severity: "info" | "warning" | "critical",
  metadata?: unknown
) {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const logEntry = JSON.stringify({
    timestamp,
    title,
    message,
    severity,
    metadata,
  })

  // Grava no arquivo de logs de notificacoes
  fs.appendFileSync(LOG_FILE_PATH, logEntry + "\n", "utf8")

  // Log no console/terminal do servidor
  console.log(`[NOTIFICATION-TRIGGER] [${severity.toUpperCase()}] ${title}: ${message}`)
}

/**
 * Verifica desvios de orcamento por categoria e riscos de fluxo de caixa futuro.
 * Retorna itens que serao integrados na Inbox Financeira.
 */
export async function checkBudgetAnomalies() {
  const anomalies: Array<{
    id: string
    kind: "uncategorized-transaction" | "ambiguous-transfer" | "bill-payment-misclassified" | "suspicious-recurring" | "salary-unconfirmed" | "connection-stale" | "bill-due" | "goal-risk" | string
    severity: "critical" | "high" | "medium" | "low"
    title: string
    description: string
    impact: string
    origin: string
    amount?: number | null
    href?: string
  }> = []

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    // Mês atual em formato chave para ID
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    // 1. CHECAGEM: Categoria estourada (Gastos atuais > 1.2 * Média Histórica de 3 meses)
    // Janela histórica: 3 meses anteriores ao mês atual
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const historyEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const [currentTransactions, historyTransactions, categories] = await Promise.all([
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          direction: "OUTFLOW",
          occurredAt: { gte: startOfMonth, lte: now },
        },
        select: { amount: true, domainCategoryId: true },
      }),
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          direction: "OUTFLOW",
          occurredAt: { gte: historyStart, lte: historyEnd },
        },
        select: { amount: true, domainCategoryId: true },
      }),
      prisma.domainCategory.findMany({
        select: { id: true, name: true, parentId: true, slug: true },
      }),
    ])

    const categoryMap = new Map(categories.map((c) => [c.id, c]))
    
    // Calcula gastos do mês atual por categoria
    const currentMap = new Map<string, number>()
    for (const tx of currentTransactions) {
      if (!tx.domainCategoryId) continue
      const val = Math.abs(Number(tx.amount))
      currentMap.set(tx.domainCategoryId, (currentMap.get(tx.domainCategoryId) ?? 0) + val)
    }

    // Calcula gastos históricos acumulados por categoria nos 3 meses
    const historyMap = new Map<string, number>()
    for (const tx of historyTransactions) {
      if (!tx.domainCategoryId) continue
      const val = Math.abs(Number(tx.amount))
      historyMap.set(tx.domainCategoryId, (historyMap.get(tx.domainCategoryId) ?? 0) + val)
    }

    // Verifica estoiros nas categorias
    for (const [catId, currentVal] of currentMap.entries()) {
      // Ignora valores muito baixos (abaixo de R$ 100) para evitar ruído
      if (currentVal < 100) continue

      const category = categoryMap.get(catId)
      if (!category) continue

      // Média móvel mensal dos últimos 3 meses
      const historyTotal = historyMap.get(catId) ?? 0
      const historyAverage = historyTotal / 3

      // Se o gasto atual superou a média histórica em mais de 20%
      if (historyAverage > 0 && currentVal > historyAverage * 1.20) {
        const excess = currentVal - historyAverage
        const title = `Orçamento estourado em ${category.name}`
        const description = `Os gastos atuais de ${category.name} atingiram R$ ${currentVal.toFixed(2)}, superando a média histórica mensal de R$ ${historyAverage.toFixed(2)}.`
        const impact = `Desvio excessivo de R$ ${excess.toFixed(2)} (${((currentVal / historyAverage - 1) * 100).toFixed(0)}% acima da média).`

        anomalies.push({
          id: `budget-deviation-${category.slug}-${monthKey}`,
          kind: "budget-deviation", // Novo tipo mapeado na Inbox
          severity: currentVal > historyAverage * 1.50 ? "high" : "medium",
          title,
          description,
          impact,
          origin: "Orçamento",
          amount: currentVal,
          href: "/cash-flow",
        })

        // Dispara o trigger de envio
        await triggerNotificationDelivery(
          title,
          `${description} ${impact}`,
          currentVal > historyAverage * 1.50 ? "warning" : "info",
          { categorySlug: category.slug, currentAmount: currentVal, average: historyAverage }
        )
      }
    }

    // 2. CHECAGEM: Risco de Caixa futuro (saldo projetado < 0 nos próximos 90 dias)
    const projections = await getProjectionPayload()
    if (projections?.months) {
      // Olha os próximos 3 meses (90 dias)
      const nextThreeMonths = projections.months.slice(0, 3)
      const criticalMonth = nextThreeMonths.find((m) => m.balance < 0)

      if (criticalMonth) {
        const title = `Alerta de Caixa Negativo Projetado`
        const description = `A projeção indica risco de saldo negativo para o mês de ${criticalMonth.label}.`
        const impact = `Saldo estimado para o período: R$ ${criticalMonth.balance.toFixed(2)}.`

        anomalies.push({
          id: `cash-risk-${criticalMonth.year}-${criticalMonth.month}`,
          kind: "cash-risk", // Novo tipo mapeado na Inbox
          severity: "critical",
          title,
          description,
          impact,
          origin: "Projeções",
          amount: criticalMonth.balance,
          href: "/projection",
        })

        // Dispara o trigger de envio
        await triggerNotificationDelivery(
          title,
          `${description} ${impact}`,
          "critical",
          { year: criticalMonth.year, month: criticalMonth.month, projectedBalance: criticalMonth.balance }
        )
      }
    }

  } catch (error) {
    console.error("Erro ao rodar checagem de notificacoes proativas:", error)
  }

  return anomalies
}
