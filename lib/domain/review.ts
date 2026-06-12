import { DomainTransactionDirection, Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import {
  classifyCashFlowTransaction,
  isSalaryLikeTransaction,
} from "@/lib/domain/analytics/shared"
import { getOverviewMetrics, getSpendingByCategoryMetrics } from "@/lib/domain/analytics"
import { parseSalaryPatternsConfig } from "@/lib/domain/salary"

type ReviewStatus = "open" | "resolved" | "ignored"
type Severity = "critical" | "high" | "medium" | "low"
type ReviewKind =
  | "uncategorized-transaction"
  | "ambiguous-transfer"
  | "bill-payment-misclassified"
  | "suspicious-recurring"
  | "salary-unconfirmed"
  | "connection-stale"
  | "bill-due"
  | "goal-risk"

export type ReviewAction = {
  label: string
  href?: string
  method?: "resolve" | "ignore"
}

export type ReviewItem = {
  id: string
  kind: ReviewKind
  severity: Severity
  title: string
  description: string
  impact: string
  origin: string
  amount?: number | null
  date?: Date | null
  href?: string
  primaryAction: ReviewAction
  secondaryAction?: ReviewAction
  status: ReviewStatus
  updatedAt?: string | null
}

type ReviewState = {
  inbox?: Record<string, { status: ReviewStatus; updatedAt: string }>
  monthlyClose?: Record<
    string,
    {
      completedSteps?: Record<string, string>
      completedAt?: string
      summary?: Record<string, unknown>
    }
  >
}

type DashboardConfig = {
  salaryPatterns?: string[]
  reviewState?: ReviewState
  [key: string]: unknown
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDashboardConfig(value?: string | null): DashboardConfig {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as DashboardConfig
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

async function getSettingsWithConfig() {
  const settings = await prisma.userSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })
  return {
    settings,
    config: parseDashboardConfig(settings.dashboardConfigJson),
  }
}

async function saveReviewState(mutator: (state: ReviewState) => ReviewState) {
  const { settings, config } = await getSettingsWithConfig()
  const nextState = mutator(config.reviewState ?? {})
  const nextConfig = {
    ...config,
    reviewState: nextState,
  }

  await prisma.userSetting.update({
    where: { id: settings.id },
    data: { dashboardConfigJson: JSON.stringify(nextConfig) },
  })

  return nextState
}

function normalizeText(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? ""
  )
}

function amount(value?: Prisma.Decimal | null) {
  return value ? Math.abs(Number(value)) : 0
}

function moneyImpact(value: number) {
  if (value <= 0) return "Impacto financeiro a revisar."
  return `Impacto aproximado: R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}.`
}

function applyStoredState(items: ReviewItem[], state: ReviewState) {
  const saved = state.inbox ?? {}
  return items.map((item) => ({
    ...item,
    status: saved[item.id]?.status ?? item.status,
    updatedAt: saved[item.id]?.updatedAt ?? null,
  }))
}

function billPaymentHint(text: string) {
  return (
    text.includes("pagamento de fatura") ||
    text.includes("pagar fatura") ||
    text.includes("pagamento de cartao") ||
    text.includes("fatura cartao") ||
    text.includes("fatura de cartao")
  )
}

export async function setInboxItemStatus(id: string, status: ReviewStatus) {
  return saveReviewState((state) => ({
    ...state,
    inbox: {
      ...(state.inbox ?? {}),
      [id]: {
        status,
        updatedAt: new Date().toISOString(),
      },
    },
  }))
}

export async function getInboxPayload() {
  const { settings, config } = await getSettingsWithConfig()
  const salaryPatterns = parseSalaryPatternsConfig(settings.dashboardConfigJson)
  const now = new Date()
  const cutoff = new Date(now.getTime() - 45 * DAY_MS)
  const dueLimit = new Date(now.getTime() + 7 * DAY_MS)

  const [
    transactions,
    categories,
    recurringRules,
    bills,
    pluggyItems,
    goals,
  ] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: {
        ignored: false,
        occurredAt: { gte: cutoff, lte: now },
      },
      orderBy: [{ occurredAt: "desc" }],
      take: 300,
    }),
    prisma.domainCategory.findMany({
      select: { id: true, name: true, parentId: true, kind: true, slug: true },
    }),
    prisma.domainRecurringRule.findMany({
      where: { active: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 50,
    }),
    prisma.domainBill.findMany({
      where: {
        dueDate: { gte: now, lte: dueLimit },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 20,
    }),
    prisma.pluggyItem.findMany({ orderBy: [{ updatedAt: "asc" }] }),
    prisma.goal.findMany({ where: { active: true }, orderBy: [{ targetDate: "asc" }] }),
  ])

  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const items: ReviewItem[] = []

  for (const tx of transactions) {
    const category = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null
    const normalizedCategory = normalizeText(category?.name ?? category?.slug)
    const isUncategorized =
      !category ||
      normalizedCategory.includes("sem categoria") ||
      normalizedCategory.includes("uncategorized")

    if (isUncategorized) {
      items.push({
        id: `tx-uncategorized-${tx.id}`,
        kind: "uncategorized-transaction",
        severity: amount(tx.amount) >= 200 ? "high" : "medium",
        title: tx.description ?? "Transação sem categoria",
        description: "Esta transação ainda não tem categoria confiável.",
        impact: moneyImpact(amount(tx.amount)),
        origin: "Transações",
        amount: amount(tx.amount),
        date: tx.occurredAt,
        href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}`,
        primaryAction: { label: "Revisar categoria", href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}` },
        secondaryAction: { label: "Ignorar", method: "ignore" },
        status: "open",
      })
    }

    const classification = classifyCashFlowTransaction(
      tx.direction,
      category?.name,
      category?.kind,
      tx.description ?? tx.normalizedDescription,
    )
    const lookup = normalizeText([tx.description, tx.normalizedDescription, category?.name].filter(Boolean).join(" "))

    if (
      tx.direction === DomainTransactionDirection.OUTFLOW &&
      billPaymentHint(lookup) &&
      classification === "expense"
    ) {
      items.push({
        id: `tx-bill-payment-${tx.id}`,
        kind: "bill-payment-misclassified",
        severity: "high",
        title: "Pagamento de fatura pode estar como gasto real",
        description: tx.description ?? "Pagamento de fatura sem descrição.",
        impact: "Pode inflar os gastos se as compras da fatura já aparecem como despesas.",
        origin: "Transações e Faturas",
        amount: amount(tx.amount),
        date: tx.occurredAt,
        href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}`,
        primaryAction: { label: "Classificar como fatura", href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}` },
        secondaryAction: { label: "Ignorar", method: "ignore" },
        status: "open",
      })
    }

    if (
      classification === "excluded" &&
      tx.direction !== DomainTransactionDirection.TRANSFER &&
      !billPaymentHint(lookup) &&
      amount(tx.amount) >= 50
    ) {
      items.push({
        id: `tx-transfer-${tx.id}`,
        kind: "ambiguous-transfer",
        severity: "medium",
        title: "Transferência interna precisa de conferência",
        description: tx.description ?? "Transferência detectada sem rota clara.",
        impact: "Confirme se é dinheiro entre suas próprias contas para não distorcer receitas ou gastos.",
        origin: "Transações",
        amount: amount(tx.amount),
        date: tx.occurredAt,
        href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}`,
        primaryAction: { label: "Abrir transação", href: `/transactions?q=${encodeURIComponent(tx.description ?? tx.id)}` },
        secondaryAction: { label: "Marcar revisado", method: "resolve" },
        status: "open",
      })
    }
  }

  const salaryCandidates = transactions.filter((tx) => {
    if (tx.direction !== DomainTransactionDirection.INFLOW || amount(tx.amount) < 200) return false
    const category = tx.domainCategoryId ? categoryMap.get(tx.domainCategoryId) : null
    const parentCategory = category?.parentId ? categoryMap.get(category.parentId) : null
    return !isSalaryLikeTransaction({
      categoryName: category?.name,
      parentCategoryName: parentCategory?.name,
      description: tx.description ?? tx.normalizedDescription,
      merchantName: tx.merchantName,
      salaryPatterns,
    })
  })
  const salaryGroups = new Map<string, typeof salaryCandidates>()
  for (const tx of salaryCandidates) {
    const key = normalizeText(tx.merchantName ?? tx.description ?? tx.normalizedDescription)
    if (!key) continue
    salaryGroups.set(key, [...(salaryGroups.get(key) ?? []), tx])
  }
  for (const [key, group] of salaryGroups.entries()) {
    const months = new Set(group.map((tx) => `${tx.occurredAt.getUTCFullYear()}-${tx.occurredAt.getUTCMonth()}`))
    if (months.size < 2) continue
    const latest = group.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]
    items.push({
      id: `salary-${key}`,
      kind: "salary-unconfirmed",
      severity: "medium",
      title: "Possível salário não confirmado",
      description: latest.description ?? latest.merchantName ?? "Entrada recorrente compatível com salário.",
      impact: "Afeta receitas reais e projeções de caixa.",
      origin: "Transações de entrada",
      amount: amount(latest.amount),
      date: latest.occurredAt,
      href: "/settings#financeiro",
      primaryAction: { label: "Confirmar fonte", href: "/settings#financeiro" },
      secondaryAction: { label: "Ignorar", method: "ignore" },
      status: "open",
    })
  }

  for (const rule of recurringRules) {
    let confidence = 1
    if (rule.metadataJson) {
      try {
        const meta = JSON.parse(rule.metadataJson) as { confidence?: unknown }
        if (typeof meta.confidence === "number") confidence = meta.confidence
      } catch {}
    }
    if (confidence >= 0.75) continue
    items.push({
      id: `recurring-${rule.id}`,
      kind: "suspicious-recurring",
      severity: "low",
      title: `Recorrência suspeita: ${rule.name}`,
      description: "A detecção existe, mas ainda tem baixa confiança.",
      impact: moneyImpact(amount(rule.amount)),
      origin: "Recorrências",
      amount: amount(rule.amount),
      href: "/recurring",
      primaryAction: { label: "Revisar recorrência", href: "/recurring" },
      secondaryAction: { label: "Marcar revisada", method: "resolve" },
      status: "open",
    })
  }

  for (const bill of bills) {
    const status = normalizeText(bill.status)
    if (status.includes("paid") || status.includes("closed")) continue
    items.push({
      id: `bill-due-${bill.id}`,
      kind: "bill-due",
      severity: bill.dueDate && bill.dueDate.getTime() - now.getTime() <= 3 * DAY_MS ? "high" : "medium",
      title: "Fatura próxima do vencimento",
      description: bill.dueDate ? `Vence em ${bill.dueDate.toLocaleDateString("pt-BR")}.` : "Vencimento próximo.",
      impact: moneyImpact(amount(bill.totalAmount)),
      origin: "Faturas",
      amount: amount(bill.totalAmount),
      date: bill.dueDate,
      href: "/bills",
      primaryAction: { label: "Abrir faturas", href: "/bills" },
      secondaryAction: { label: "Marcar revisada", method: "resolve" },
      status: "open",
    })
  }

  for (const item of pluggyItems) {
    const staleHours = Math.max(settings.syncIntervalHours * 2, 12)
    const isStale = now.getTime() - item.updatedAt.getTime() > staleHours * 60 * 60 * 1000
    const needsAuth = item.status && item.status !== "UPDATED" && item.status !== "UPDATING"
    if (!isStale && !needsAuth) continue
    items.push({
      id: `connection-${item.pluggyItemId}`,
      kind: "connection-stale",
      severity: needsAuth ? "high" : "medium",
      title: `${item.connectorName ?? "Instituição"} precisa de atenção`,
      description: needsAuth
        ? `Status atual: ${item.status}.`
        : `Última atualização em ${item.updatedAt.toLocaleString("pt-BR")}.`,
      impact: "Dados atrasados podem afetar saldo, faturas e projeções.",
      origin: "Conexões",
      date: item.updatedAt,
      href: "/connect",
      primaryAction: { label: "Abrir conexão", href: "/connect" },
      secondaryAction: { label: "Ignorar", method: "ignore" },
      status: "open",
    })
  }

  for (const goal of goals) {
    if (!goal.targetDate) continue
    const remaining = Number(goal.targetAmount) - Number(goal.currentAmount)
    if (remaining <= 0) continue
    const monthsLeft = Math.max(
      1,
      Math.ceil((goal.targetDate.getTime() - now.getTime()) / (30 * DAY_MS)),
    )
    const requiredMonthly = remaining / monthsLeft
    const contribution = Number(goal.monthlyContribution)
    if (contribution >= requiredMonthly) continue
    items.push({
      id: `goal-risk-${goal.id}`,
      kind: "goal-risk",
      severity: contribution === 0 ? "high" : "medium",
      title: `Meta em risco: ${goal.name}`,
      description: `Aporte atual abaixo do necessário para o prazo.`,
      impact: `Necessário cerca de R$ ${requiredMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês.`,
      origin: "Metas",
      amount: remaining,
      date: goal.targetDate,
      href: "/goals",
      primaryAction: { label: "Abrir metas", href: "/goals" },
      secondaryAction: { label: "Marcar revisada", method: "resolve" },
      status: "open",
    })
  }

  const deduped = Array.from(new Map(items.map((item) => [item.id, item])).values())
  const withState = applyStoredState(deduped, config.reviewState ?? {})
  const visible = withState.sort((left, right) => {
    const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    return severityOrder[left.severity] - severityOrder[right.severity]
  })

  return {
    summary: {
      total: visible.length,
      open: visible.filter((item) => item.status === "open").length,
      resolved: visible.filter((item) => item.status === "resolved").length,
      ignored: visible.filter((item) => item.status === "ignored").length,
      high: visible.filter((item) => item.severity === "high" || item.severity === "critical").length,
    },
    results: visible,
  }
}

export type MonthlyCloseStep = {
  id: string
  title: string
  description: string
  href: string
  pending: number
  impact: string
  completed: boolean
  completedAt?: string | null
}

function monthRange(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const to = new Date(year, month, 0, 23, 59, 59, 999)
  return { from, to }
}

export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export async function setMonthlyCloseStep(monthKey: string, stepId: string, completed: boolean) {
  const now = new Date().toISOString()
  return saveReviewState((state) => {
    const current = state.monthlyClose?.[monthKey] ?? {}
    const completedSteps = { ...(current.completedSteps ?? {}) }
    if (completed) completedSteps[stepId] = now
    else delete completedSteps[stepId]
    return {
      ...state,
      monthlyClose: {
        ...(state.monthlyClose ?? {}),
        [monthKey]: {
          ...current,
          completedSteps,
        },
      },
    }
  })
}

export async function completeMonthlyClose(monthKey: string, summary: Record<string, unknown>) {
  const now = new Date().toISOString()
  return saveReviewState((state) => ({
    ...state,
    monthlyClose: {
      ...(state.monthlyClose ?? {}),
      [monthKey]: {
        ...(state.monthlyClose?.[monthKey] ?? {}),
        completedAt: now,
        summary,
      },
    },
  }))
}

export async function getMonthlyClosePayload(monthKey = currentMonthKey()) {
  const { config } = await getSettingsWithConfig()
  const { from, to } = monthRange(monthKey)
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    showFutureSalary: "true",
    showFutureAccounts: "true",
  })

  const [inbox, overview, categories, bills, recurringCount] = await Promise.all([
    getInboxPayload(),
    getOverviewMetrics(params),
    getSpendingByCategoryMetrics(new URLSearchParams({ ...Object.fromEntries(params), limit: "1" })),
    prisma.domainBill.count({
      where: {
        dueDate: { gte: from, lte: to },
      },
    }),
    prisma.domainRecurringRule.count({ where: { active: true } }),
  ])

  const openItems = inbox.results.filter((item) => item.status === "open")
  const state = config.reviewState?.monthlyClose?.[monthKey] ?? {}
  const completedSteps = state.completedSteps ?? {}
  const byKind = (kinds: ReviewKind[]) =>
    openItems.filter((item) => kinds.includes(item.kind)).length
  const topCategory = categories.results[0]
  const income = Number(overview.periodInflow)
  const outflow = Number(overview.periodOutflow)
  const net = income - outflow
  const savingsRate = income > 0 ? (net / income) * 100 : null

  const steps: MonthlyCloseStep[] = [
    {
      id: "income",
      title: "Confirmar receitas",
      description: "Revise salários e entradas relevantes do mês.",
      href: "/inbox",
      pending: byKind(["salary-unconfirmed"]),
      impact: `${income.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em receitas reais.`,
      completed: Boolean(completedSteps.income),
      completedAt: completedSteps.income ?? null,
    },
    {
      id: "transfers",
      title: "Revisar transferências internas",
      description: "Confirme movimentações entre contas próprias.",
      href: "/inbox",
      pending: byKind(["ambiguous-transfer"]),
      impact: "Evita inflar receitas ou despesas operacionais.",
      completed: Boolean(completedSteps.transfers),
      completedAt: completedSteps.transfers ?? null,
    },
    {
      id: "bill-payments",
      title: "Conferir pagamentos de fatura",
      description: "Separe pagamento da fatura dos gastos de competência.",
      href: "/inbox",
      pending: byKind(["bill-payment-misclassified"]),
      impact: "Mantém compras e pagamento da fatura em leituras diferentes.",
      completed: Boolean(completedSteps["bill-payments"]),
      completedAt: completedSteps["bill-payments"] ?? null,
    },
    {
      id: "categories",
      title: "Validar categorias",
      description: "Corrija transações sem categoria confiável.",
      href: "/inbox",
      pending: byKind(["uncategorized-transaction"]),
      impact: topCategory ? `Maior categoria: ${topCategory.name}.` : "Sem categoria principal no período.",
      completed: Boolean(completedSteps.categories),
      completedAt: completedSteps.categories ?? null,
    },
    {
      id: "recurring",
      title: "Confirmar recorrências",
      description: "Revise assinaturas e recorrências suspeitas.",
      href: "/recurring",
      pending: byKind(["suspicious-recurring"]),
      impact: `${recurringCount} regras ativas acompanhadas.`,
      completed: Boolean(completedSteps.recurring),
      completedAt: completedSteps.recurring ?? null,
    },
    {
      id: "bills",
      title: "Conferir faturas abertas",
      description: "Cheque vencimentos e valores do mês.",
      href: "/bills",
      pending: byKind(["bill-due"]),
      impact: `${bills} faturas no período.`,
      completed: Boolean(completedSteps.bills),
      completedAt: completedSteps.bills ?? null,
    },
    {
      id: "goals",
      title: "Atualizar metas e aportes",
      description: "Confirme se os aportes planejados continuam viáveis.",
      href: "/goals",
      pending: byKind(["goal-risk"]),
      impact: "Mostra metas que podem atrasar.",
      completed: Boolean(completedSteps.goals),
      completedAt: completedSteps.goals ?? null,
    },
  ]

  const completed = steps.filter((step) => step.completed).length
  const summary = {
    monthKey,
    income,
    outflow,
    net,
    savingsRate,
    topCategory: topCategory
      ? {
          name: topCategory.name,
          amount: Number(topCategory.amount),
        }
      : null,
    openInboxItems: openItems.length,
    completedSteps: completed,
    totalSteps: steps.length,
    completedAt: state.completedAt ?? null,
  }

  return {
    summary,
    results: steps,
  }
}
