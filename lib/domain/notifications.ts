import * as fs from "fs"
import * as path from "path"
import webpush from "web-push"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  SPENDING_TRANSACTION_SELECT,
  filterOperationalSpending,
} from "@/lib/domain/analytics/spending-query"
import { getProjectionPayload } from "@/lib/domain/derived"

const LOG_FILE_PATH = path.join(process.cwd(), ".agents", "logs", "notifications.log")

/**
 * VAPID vem do cofre, configurado na primeira necessidade.
 *
 * Antes era lido de `process.env` no carregamento do módulo — e o container nunca
 * recebeu as chaves, então o push estava silenciosamente morto em produção. Ler
 * sob demanda permite cadastrar pela tela e passar a funcionar sem rebuild.
 */
export async function getVapidKeys() {
  const { getManagedSecretValue } = await import("@/lib/server/secret-store")
  const [pub, priv] = await Promise.all([
    getManagedSecretValue("VAPID_PUBLIC_KEY"),
    getManagedSecretValue("VAPID_PRIVATE_KEY"),
  ])
  return { publicKey: pub.value, privateKey: priv.value }
}

async function configureWebPush() {
  const { publicKey, privateKey } = await getVapidKeys()
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails("mailto:admin@gravel.finance", publicKey, privateKey)
  return true
}

// Assegura que o diretório de logs existe
function ensureLogDir() {
  const dir = path.dirname(LOG_FILE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Header HTTP não carrega UTF-8: o título "teste de notificação" chegava no
 * celular como "notifica\ufffdo". A saída é RFC 2047 (encoded-word), que o ntfy
 * decodifica — conferido contra o ntfy do lab. ASCII puro passa direto, para o
 * header continuar legível em log e em `curl -v`.
 */
function encodeHeaderValue(value: string): string {
  if (!/[^\u0000-\u007f]/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

/**
 * Trigger de entrega de notificacoes.
 * Grava localmente e envia via webhook Slack-compatible, ntfy, Telegram e Web
 * Push — cada um só se estiver configurado.
 */
/**
 * Reivindica o direito de enviar um alerta — uma vez só.
 *
 * `checkBudgetAnomalies()` é chamada por `getInboxPayload()`, que roda a cada
 * abertura da Inbox. Antes disso aqui, cada refresh do app remandava os mesmos
 * alertas por push, Telegram e ntfy; deixar a aba aberta virava spam. A chave
 * carrega o mês, então o mesmo estouro volta a avisar no mês seguinte — que é
 * o comportamento desejado, e não um efeito colateral.
 *
 * Devolve `true` só para quem gravou a linha. A corrida é resolvida pelo
 * índice único: o segundo a tentar leva P2002 e sai calado.
 */
export async function claimNotificationDelivery(
  key: string,
  kind: string,
  title?: string,
) {
  try {
    await prisma.notificationDelivery.create({ data: { key, kind, title } })
    return true
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false
    }
    // Falha de banco não pode derrubar a Inbox. Não enviar é o lado seguro:
    // alerta perdido incomoda menos que alerta repetido em looping.
    console.error("[NOTIFICATION] não foi possível registrar a entrega:", error)
    return false
  }
}

/** Envia o alerta se — e só se — ele ainda não tiver sido enviado. */
export async function deliverNotificationOnce(
  key: string,
  kind: string,
  title: string,
  message: string,
  severity: "info" | "warning" | "critical",
  metadata?: unknown,
) {
  if (!(await claimNotificationDelivery(key, kind, title))) return false
  await triggerNotificationDelivery(title, message, severity, metadata)
  return true
}

export async function triggerNotificationDelivery(
  title: string,
  message: string,
  severity: "info" | "warning" | "critical",
  metadata?: unknown
) {
  ensureLogDir()
  const timestamp = new Date().toISOString()
  const logEntry = JSON.stringify({ timestamp, title, message, severity, metadata })
  fs.appendFileSync(LOG_FILE_PATH, logEntry + "\n", "utf8")
  console.log(`[NOTIFICATION-TRIGGER] [${severity.toUpperCase()}] ${title}: ${message}`)

  try {
    const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })
    if (!settings) return

    const text = `[${severity.toUpperCase()}] *${title}*\n${message}`

    if (settings.notificationWebhookUrl) {
      await fetch(settings.notificationWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch((err) => console.error("[NOTIFICATION] Webhook delivery failed:", err))
    }

    // ntfy é destino próprio, não um webhook Slack-compatible: ele publica o
    // CORPO da requisição como mensagem. Mandar `{"text": ...}` para um tópico
    // ntfy entrega o JSON cru no celular. Título, prioridade e tag vão em
    // header, que é a interface dele.
    if (settings.ntfyTopicUrl) {
      const priority = severity === "critical" ? "5" : severity === "warning" ? "4" : "3"
      const tag = severity === "critical" ? "rotating_light" : severity === "warning" ? "warning" : "moneybag"
      await fetch(settings.ntfyTopicUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Title: encodeHeaderValue(title),
          Priority: priority,
          Tags: tag,
          ...(settings.ntfyToken ? { Authorization: `Bearer ${settings.ntfyToken}` } : {}),
        },
        body: message,
      }).catch((err) => console.error("[NOTIFICATION] ntfy delivery failed:", err))
    }

    if (settings.telegramBotToken && settings.telegramChatId) {
      await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: settings.telegramChatId, text, parse_mode: "Markdown" }),
      }).catch((err) => console.error("[NOTIFICATION] Telegram delivery failed:", err))
    }
  } catch (err) {
    console.error("[NOTIFICATION] Settings lookup failed:", err)
  }

  if (await configureWebPush()) {
    try {
      const subs = await prisma.pushSubscription.findMany()
      const payload = JSON.stringify({ title, body: message, href: "/" })
      await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          ).catch((err) => console.error("[NOTIFICATION] Push delivery failed:", err))
        )
      )
    } catch (err) {
      console.error("[NOTIFICATION] Push subscriptions lookup failed:", err)
    }
  }
}

/**
 * Avisa que uma conexão precisa de atenção (MFA, credencial expirada, erro na
 * instituição, consentimento vencendo). Chamado pelo webhook e pelo scheduler —
 * é o único caminho em que o app descobre o problema sem o usuário abrir a tela.
 */
export async function notifyPluggyItemProblem(
  itemId: string,
  message: string,
  severity: "warning" | "critical" = "warning",
) {
  const item = await prisma.pluggyItem.findUnique({
    where: { pluggyItemId: itemId },
    select: { connectorName: true },
  })
  const institution = item?.connectorName ?? "Instituição"

  await triggerNotificationDelivery(
    `${institution}: conexão precisa de atenção`,
    message,
    severity,
    { itemId },
  )
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
      // Traz INFLOW junto de propósito: o pareamento de transferência interna
      // precisa das duas pernas para reconhecer que uma anula a outra.
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          occurredAt: { gte: startOfMonth, lte: now },
        },
        select: SPENDING_TRANSACTION_SELECT,
      }),
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          occurredAt: { gte: historyStart, lte: historyEnd },
        },
        select: SPENDING_TRANSACTION_SELECT,
      }),
      prisma.domainCategory.findMany({
        select: { id: true, name: true, parentId: true, slug: true },
      }),
    ])

    const categoryMap = new Map(categories.map((c) => [c.id, c]))

    // A mesma política do fluxo de caixa. Sem ela, transferência entre contas
    // próprias, pagamento de fatura e aporte entravam como gasto — e a
    // categoria "Transferências" estourava o orçamento todo mês sozinha.
    const currentSpending = filterOperationalSpending(currentTransactions)
    const historySpending = filterOperationalSpending(historyTransactions)

    // Calcula gastos do mês atual por categoria
    const currentMap = new Map<string, number>()
    for (const tx of currentSpending) {
      if (!tx.domainCategoryId) continue
      const val = Math.abs(Number(tx.amount))
      currentMap.set(tx.domainCategoryId, (currentMap.get(tx.domainCategoryId) ?? 0) + val)
    }

    // Calcula gastos históricos acumulados por categoria nos 3 meses
    const historyMap = new Map<string, number>()
    for (const tx of historySpending) {
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

        // Uma vez por categoria por mês. A chave é a mesma do item da Inbox,
        // que já carrega o monthKey.
        await deliverNotificationOnce(
          `budget-deviation-${category.slug}-${monthKey}`,
          "budget-deviation",
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

        await deliverNotificationOnce(
          `cash-risk-${criticalMonth.year}-${criticalMonth.month}`,
          "cash-risk",
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
