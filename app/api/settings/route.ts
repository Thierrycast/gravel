import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"
import { ensureRecurringDerivedFresh } from "@/lib/domain/derived"
import { getUserSettings } from "@/lib/domain/queries"

type DashboardConfig = {
  salaryPatterns?: string[]
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
  if (settings.dashboardConfigJson) {
    try {
      const parsed = JSON.parse(settings.dashboardConfigJson)
      if (Array.isArray(parsed.salaryPatterns)) {
        salaryPatterns = parsed.salaryPatterns
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
    salaryPatterns,
    salarySources,
    salarySuggestions,
    effectiveMonthlySalary: effectiveSettings.monthlySalary,
  }

  return NextResponse.json(serialized)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { 
    monthlySalary, 
    showFutureSalary, 
    showFutureAccounts, 
    syncIntervalHours, 
    syncLookbackDays,
    dashboardConfigJson,
    salaryPatterns,
    vaultEnabled,
    vaultMasterPassword,
    vaultInactivityMin 
  } = body

  let updatedConfigJson = dashboardConfigJson
  if (salaryPatterns !== undefined) {
    const current = await prisma.userSetting.findFirst({
      where: { id: "default" },
    })
    let config: DashboardConfig = {}
    if (current?.dashboardConfigJson) {
      try {
        config = JSON.parse(current.dashboardConfigJson)
      } catch {}
    }
    config.salaryPatterns = salaryPatterns
    updatedConfigJson = JSON.stringify(config)

    const salaryCat = await prisma.domainCategory.findFirst({
      where: {
        OR: [
          { slug: "seed-salary" },
          { name: { contains: "salario" } },
          { name: { contains: "salário" } },
        ],
      },
    })
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
      syncIntervalHours: syncIntervalHours !== undefined ? syncIntervalHours : undefined,
      syncLookbackDays: syncLookbackDays !== undefined ? syncLookbackDays : undefined,
      dashboardConfigJson: updatedConfigJson !== undefined ? updatedConfigJson : undefined,
      vaultEnabled: vaultEnabled !== undefined ? vaultEnabled : undefined,
      vaultMasterPassword: vaultMasterPassword !== undefined ? vaultMasterPassword : undefined,
      vaultInactivityMin: vaultInactivityMin !== undefined ? vaultInactivityMin : undefined,
    },
  })

  // Padrões de salário afetam a classificação de renda: re-detecta as
  // recorrências imediatamente para o salário aparecer em receitas/projeção.
  if (salaryPatterns !== undefined) {
    await ensureRecurringDerivedFresh({ force: true })
  }

  return NextResponse.json(serializeForJson(settings))
}
