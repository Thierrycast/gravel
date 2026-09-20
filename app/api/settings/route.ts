import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"
import { hashMasterPassword } from "@/lib/server/secret-store"
import { storeVaultKeyRecovery } from "@/lib/server/vault-key"
import { ensureRecurringDerivedFresh } from "@/lib/domain/derived"
import { getUserSettings } from "@/lib/domain/queries"

type DashboardConfig = {
  salaryPatterns?: string[]
  ai?: {
    provider?: "anthropic" | "openai-compatible"
    baseUrl?: string
    model?: string
  }
  // Endereço do speech-api (voz do chat). Fica aqui, e não em `NEXT_PUBLIC_*`,
  // porque é infraestrutura pessoal dele e este repo tem remote no GitHub.
  speech?: {
    baseUrl?: string
    voice?: string
  }
  [key: string]: unknown
}

async function getSalarySuggestions(salaryPatterns: string[]) {
  const cutoff = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
  const inflows = await prisma.domainTransaction.findMany({
    where: {
      direction: "INFLOW",
      occurredAt: { gte: cutoff },
    },
    select: {
      id: true,
      description: true,
      amount: true,
      occurredAt: true,
      domainCategoryId: true,
    },
  })

  const groups: Record<string, typeof inflows> = {}
  for (const tx of inflows) {
    if (!tx.description) continue
    const clean = tx.description.trim()
    if (!groups[clean]) {
      groups[clean] = []
    }
    groups[clean].push(tx)
  }

  const salaryCat = await prisma.domainCategory.findFirst({
    where: {
      OR: [
        { slug: "seed-salary" },
        { name: { contains: "salario" } },
        { name: { contains: "salário" } },
      ],
    },
  })

  const suggestions: Array<{
    pattern: string
    averageAmount: number
    lastDate: Date
    lastDescription: string
  }> = []

  for (const [description, txs] of Object.entries(groups)) {
    if (txs.length < 2) continue

    if (salaryCat && txs.some(tx => tx.domainCategoryId === salaryCat.id)) {
      continue
    }

    if (salaryPatterns.some(p => description.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(description.toLowerCase()))) {
      continue
    }

    const months = new Set(txs.map(tx => {
      const d = new Date(tx.occurredAt)
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}`
    }))
    if (months.size < 2) continue

    const amounts = txs.map(tx => Number(tx.amount))
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    const sum = amounts.reduce((a, b) => a + b, 0)
    const avg = sum / amounts.length

    if (avg < 200) continue

    const variancePercent = (max - min) / avg
    if (variancePercent > 0.15) continue

    txs.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    const lastTx = txs[0]

    suggestions.push({
      pattern: description,
      averageAmount: Math.round(avg * 100) / 100,
      lastDate: lastTx.occurredAt,
      lastDescription: lastTx.description || description,
    })
  }

  return suggestions
}

export async function GET() {
  const settings = await prisma.userSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })

  let salaryPatterns: string[] = []
  let dashboardConfig: DashboardConfig = {}
  if (settings.dashboardConfigJson) {
    try {
      dashboardConfig = JSON.parse(settings.dashboardConfigJson)
      if (Array.isArray(dashboardConfig.salaryPatterns)) {
        salaryPatterns = dashboardConfig.salaryPatterns
      }
    } catch {}
  }

  const salarySources = await Promise.all(
    salaryPatterns.map(async (pattern) => {
      const lastTx = await prisma.domainTransaction.findFirst({
        where: {
          direction: "INFLOW",
          OR: [
            { description: { contains: pattern } },
            { merchantName: { contains: pattern } },
          ],
        },
        orderBy: { occurredAt: "desc" },
      })

      return {
        pattern,
        lastAmount: lastTx ? Number(lastTx.amount) : null,
        lastDate: lastTx ? lastTx.occurredAt : null,
        lastDescription: lastTx ? lastTx.description : null,
      }
    })
  )

  const salarySuggestions = await getSalarySuggestions(salaryPatterns)
  const effectiveSettings = await getUserSettings()

  const serialized = {
    ...serializeForJson(settings),
    // A senha mestre (hash) NUNCA sai do servidor. Antes disto o spread acima a
    // enviava ao cliente em toda visita à tela de configurações, e o formulário
    // a carregava num input. O cliente só precisa saber se ela existe.
    vaultMasterPassword: undefined,
    anthropicApiKey: undefined,
    hasVaultMasterPassword: Boolean(settings.vaultMasterPassword),
    salaryPatterns,
    salarySources,
    salarySuggestions,
    effectiveMonthlySalary: effectiveSettings.monthlySalary,
    // O padrão vem do ambiente do deploy, não de "anthropic" fixo aqui.
    //
    // Com o padrão fixo, abrir /settings e salvar qualquer coisa gravava
    // `provider: "anthropic"` sem ele ter escolhido nada — e como o que está
    // salvo vence o ambiente em `resolveAiConfig`, o app passou a mandar a
    // chave do OmniRoute para a Anthropic e tomar 401 no briefing e no chat.
    // A tela tem de mostrar o que o app realmente usa.
    aiProvider:
      dashboardConfig.ai?.provider ??
      (process.env.AI_PROVIDER === "openai-compatible" ? "openai-compatible" : "anthropic"),
    aiBaseUrl: dashboardConfig.ai?.baseUrl ?? process.env.AI_BASE_URL?.trim() ?? "",
    aiModel:
      dashboardConfig.ai?.model ?? process.env.AI_MODEL?.trim() ?? "claude-haiku-4-5-20251001",
    speechBaseUrl: dashboardConfig.speech?.baseUrl ?? "",
    speechVoice: dashboardConfig.speech?.voice ?? "",
  }

  return NextResponse.json(serialized)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const {
    monthlySalary,
    showFutureSalary,
    showFutureAccounts,
    syncIntervalMinutes,
    syncLookbackDays,
    dashboardConfigJson,
    salaryPatterns,
    vaultEnabled,
    vaultMasterPassword,
    vaultInactivityMin,
    notificationWebhookUrl,
    ntfyTopicUrl,
    ntfyToken,
    telegramBotToken,
    telegramChatId,
    aiProvider,
    aiBaseUrl,
    aiModel,
    speechBaseUrl,
    speechVoice,
  } = body

  let updatedConfigJson = dashboardConfigJson
  if (
    salaryPatterns !== undefined ||
    aiProvider !== undefined ||
    aiBaseUrl !== undefined ||
    aiModel !== undefined ||
    speechBaseUrl !== undefined ||
    speechVoice !== undefined
  ) {
    const current = await prisma.userSetting.findFirst({
      where: { id: "default" },
    })
    let config: DashboardConfig = {}
    if (current?.dashboardConfigJson) {
      try {
        config = JSON.parse(current.dashboardConfigJson)
      } catch {}
    }
    if (salaryPatterns !== undefined) config.salaryPatterns = salaryPatterns
    if (aiProvider !== undefined || aiBaseUrl !== undefined || aiModel !== undefined) {
      config.ai = {
        ...config.ai,
        ...(aiProvider !== undefined ? { provider: aiProvider } : {}),
        ...(aiBaseUrl !== undefined ? { baseUrl: String(aiBaseUrl).trim() } : {}),
        ...(aiModel !== undefined ? { model: String(aiModel).trim() } : {}),
      }
    }
    if (speechBaseUrl !== undefined || speechVoice !== undefined) {
      config.speech = {
        ...config.speech,
        ...(speechBaseUrl !== undefined ? { baseUrl: String(speechBaseUrl).trim() } : {}),
        ...(speechVoice !== undefined ? { voice: String(speechVoice).trim() } : {}),
      }
    }
    updatedConfigJson = JSON.stringify(config)

    const salaryCat = salaryPatterns !== undefined ? await prisma.domainCategory.findFirst({
      where: {
        OR: [
          { slug: "seed-salary" },
          { name: { contains: "salario" } },
          { name: { contains: "salário" } },
        ],
      },
    }) : null
    if (salaryCat) {
      for (const pattern of salaryPatterns) {
        await prisma.domainTransaction.updateMany({
          where: {
            direction: "INFLOW",
            OR: [
              { description: { contains: pattern } },
              { merchantName: { contains: pattern } },
            ],
          },
          data: {
            domainCategoryId: salaryCat.id,
          },
        })
      }
    }
  }

  const settings = await prisma.userSetting.update({
    where: { id: "default" },
    data: {
      monthlySalary: monthlySalary !== undefined ? monthlySalary : undefined,
      showFutureSalary: showFutureSalary !== undefined ? showFutureSalary : undefined,
      showFutureAccounts: showFutureAccounts !== undefined ? showFutureAccounts : undefined,
      syncIntervalMinutes:
        syncIntervalMinutes !== undefined
          ? Math.max(1, Number(syncIntervalMinutes))
          : undefined,
      syncLookbackDays: syncLookbackDays !== undefined ? syncLookbackDays : undefined,
      dashboardConfigJson: updatedConfigJson !== undefined ? updatedConfigJson : undefined,
      vaultEnabled: vaultEnabled !== undefined ? vaultEnabled : undefined,
      // A senha mestre é gravada como hash scrypt, nunca em texto. Antes disto o
      // valor do formulário ia cru para o banco — e o banco vai para backup.
      vaultMasterPassword:
        vaultMasterPassword !== undefined
          ? vaultMasterPassword
            ? await hashMasterPassword(String(vaultMasterPassword))
            : null
          : undefined,
      vaultInactivityMin: vaultInactivityMin !== undefined ? vaultInactivityMin : undefined,
      notificationWebhookUrl: notificationWebhookUrl !== undefined ? (notificationWebhookUrl || null) : undefined,
      ntfyTopicUrl: ntfyTopicUrl !== undefined ? (ntfyTopicUrl || null) : undefined,
      ntfyToken: ntfyToken !== undefined ? (ntfyToken || null) : undefined,
      telegramBotToken: telegramBotToken !== undefined ? (telegramBotToken || null) : undefined,
      telegramChatId: telegramChatId !== undefined ? (telegramChatId || null) : undefined,
    },
  })

  // Senha mestre definida/trocada: reembrulha a chave do cofre sob ela, para que
  // um restore do backup (que só contém o banco) recupere os segredos numa
  // máquina nova, sem enfraquecer o backup contra roubo.
  if (vaultMasterPassword) {
    await storeVaultKeyRecovery(String(vaultMasterPassword)).catch((error) =>
      console.error("[settings] falha ao guardar recuperação da chave:", error),
    )
  }

  // Padrões de salário afetam a classificação de renda: re-detecta as
  // recorrências imediatamente para o salário aparecer em receitas/projeção.
  if (salaryPatterns !== undefined) {
    await ensureRecurringDerivedFresh({ force: true })
  }

  return NextResponse.json(
    serializeForJson({
      ...settings,
      // Idem GET: o hash não volta para o cliente.
      vaultMasterPassword: undefined,
      anthropicApiKey: undefined,
      hasVaultMasterPassword: Boolean(settings.vaultMasterPassword),
    }),
  )
}
