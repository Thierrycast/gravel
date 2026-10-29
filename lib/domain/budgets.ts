import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  SPENDING_TRANSACTION_SELECT,
  filterOperationalSpending,
} from "@/lib/domain/analytics/spending-query"

/**
 * Orçamento mensal por categoria.
 *
 * O gasto é o mesmo que o fluxo de caixa e os relatórios mostram: despesa
 * operacional (sem transferência entre contas próprias, pagamento de fatura ou
 * aporte), somando a categoria e as subcategorias dela. Um orçamento em
 * "Alimentação" cobre "Supermercado" e "Restaurantes" se forem filhas.
 */

export type BudgetStatus = "ok" | "warning" | "over"

export type BudgetProgress = {
  id: string
  categoryId: string
  categoryName: string
  categorySlug: string
  monthlyLimit: number
  alertAtPercent: number
  spent: number
  remaining: number
  /** Gasto / limite, em %. */
  percent: number
  /** Gasto estimado no fim do mês pelo ritmo atual. */
  projected: number
  status: BudgetStatus
  /** Por que o status não é "ok", em português, para tela e alerta. */
  reason: string | null
}

type CategoryNode = { id: string; parentId: string | null }

/** A categoria e todas as descendentes (a árvore pode ter mais de um nível). */
export function descendantIds(rootId: string, categories: CategoryNode[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    const list = children.get(category.parentId) ?? []
    list.push(category.id)
    children.set(category.parentId, list)
  }
  const result = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const child of children.get(current) ?? []) {
      if (result.has(child)) continue
      result.add(child)
      stack.push(child)
    }
  }
  return result
}

const round = (value: number) => Math.round(value * 100) / 100

export function summarizeBudget(input: {
  monthlyLimit: number
  alertAtPercent: number
  spent: number
  /** Fração do mês já decorrida, de 0 a 1. */
  monthElapsed: number
}): Pick<BudgetProgress, "spent" | "remaining" | "percent" | "projected" | "status" | "reason"> {
  const { monthlyLimit, alertAtPercent, spent } = input
  const elapsed = Math.min(1, Math.max(input.monthElapsed, 0))
  const percent = monthlyLimit > 0 ? (spent / monthlyLimit) * 100 : 0
  // Projeção linear só depois de alguns dias: no dia 1, uma compra grande
  // projetaria um mês inteiro absurdo.
  const projected = elapsed >= 0.15 ? spent / elapsed : spent

  let status: BudgetStatus = "ok"
  let reason: string | null = null
  if (spent > monthlyLimit) {
    status = "over"
    reason = "Limite do mês estourado."
  } else if (percent >= alertAtPercent) {
    status = "warning"
    reason = `${Math.floor(percent)}% do limite já usado.`
  } else if (projected > monthlyLimit && elapsed >= 0.15) {
    status = "warning"
    reason = "No ritmo atual, o mês fecha acima do limite."
  }

  return {
    spent: round(spent),
    remaining: round(monthlyLimit - spent),
    percent: round(percent),
    projected: round(projected),
    status,
    reason,
  }
}

function monthBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const elapsed = (now.getTime() - start.getTime()) / (next.getTime() - start.getTime())
  return { start, end: now, elapsed }
}

export async function getBudgetsProgress(options?: { now?: Date; includeInactive?: boolean }) {
  const now = options?.now ?? new Date()
  const { start, end, elapsed } = monthBounds(now)

  const [budgets, categories, transactions] = await Promise.all([
    prisma.domainBudget.findMany({
      where: options?.includeInactive ? undefined : { active: true },
      include: { category: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.domainCategory.findMany({ select: { id: true, parentId: true } }),
    // INFLOW junto: o pareamento de transferência interna precisa das duas pernas.
    prisma.domainTransaction.findMany({
      where: { ignored: false, occurredAt: { gte: start, lte: end } },
      select: SPENDING_TRANSACTION_SELECT,
    }),
  ])

  const spentByCategory = new Map<string, number>()
  for (const tx of filterOperationalSpending(transactions)) {
    if (!tx.domainCategoryId) continue
    spentByCategory.set(
      tx.domainCategoryId,
      (spentByCategory.get(tx.domainCategoryId) ?? 0) + Math.abs(Number(tx.amount)),
    )
  }

  const results: Array<BudgetProgress & { active: boolean }> = budgets.map((budget) => {
    let spent = 0
    for (const id of descendantIds(budget.categoryId, categories)) {
      spent += spentByCategory.get(id) ?? 0
    }
    const monthlyLimit = Number(budget.monthlyLimit)
    return {
      id: budget.id,
      categoryId: budget.categoryId,
      categoryName: budget.category.name,
      categorySlug: budget.category.slug,
      monthlyLimit,
      alertAtPercent: budget.alertAtPercent,
      active: budget.active,
      ...summarizeBudget({ monthlyLimit, alertAtPercent: budget.alertAtPercent, spent, monthElapsed: elapsed }),
    }
  })

  const totalLimit = results.reduce((sum, item) => sum + item.monthlyLimit, 0)
  const totalSpent = results.reduce((sum, item) => sum + item.spent, 0)

  return {
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    monthElapsedPercent: round(elapsed * 100),
    summary: {
      count: results.length,
      totalLimit: round(totalLimit),
      totalSpent: round(totalSpent),
      over: results.filter((item) => item.status === "over").length,
      warning: results.filter((item) => item.status === "warning").length,
    },
    results,
  }
}

/** Resolve a categoria por id ou slug — o MCP costuma ter só o slug. */
async function resolveCategoryId(ref: { categoryId?: string; categorySlug?: string }) {
  if (ref.categoryId) {
    const found = await prisma.domainCategory.findUnique({ where: { id: ref.categoryId }, select: { id: true } })
    return found?.id ?? null
  }
  if (ref.categorySlug) {
    const found = await prisma.domainCategory.findUnique({ where: { slug: ref.categorySlug }, select: { id: true } })
    return found?.id ?? null
  }
  return null
}

/**
 * Cria ou substitui o orçamento da categoria (um por categoria). Reativa um
 * orçamento desativado em vez de duplicar.
 */
export async function upsertBudget(input: {
  categoryId?: string
  categorySlug?: string
  monthlyLimit: number
  alertAtPercent?: number
}) {
  if (!Number.isFinite(input.monthlyLimit) || input.monthlyLimit <= 0) {
    throw new Error("O limite mensal precisa ser maior que zero.")
  }
  const alertAtPercent = input.alertAtPercent ?? 80
  if (!Number.isInteger(alertAtPercent) || alertAtPercent < 1 || alertAtPercent > 100) {
    throw new Error("O percentual de aviso precisa ser um inteiro entre 1 e 100.")
  }
  const categoryId = await resolveCategoryId(input)
  if (!categoryId) throw new Error("Categoria não encontrada.")

  const data = {
    monthlyLimit: new Prisma.Decimal(Math.round(input.monthlyLimit * 100) / 100),
    alertAtPercent,
    active: true,
  }
  return prisma.domainBudget.upsert({
    where: { categoryId },
    create: { categoryId, ...data },
    update: data,
  })
}

export async function deleteBudget(ref: { id?: string; categorySlug?: string }) {
  const where = ref.id
    ? { id: ref.id }
    : ref.categorySlug
      ? { categoryId: (await resolveCategoryId({ categorySlug: ref.categorySlug })) ?? "__none__" }
      : null
  if (!where) throw new Error("Informe o id do orçamento ou o slug da categoria.")
  const existing = await prisma.domainBudget.findUnique({ where, select: { id: true } })
  if (!existing) throw new Error("Orçamento não encontrado.")
  await prisma.domainBudget.delete({ where: { id: existing.id } })
  return { id: existing.id, deleted: true }
}
