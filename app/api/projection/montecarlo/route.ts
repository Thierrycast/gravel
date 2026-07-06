import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getProjectionPayload } from "@/lib/domain/derived"
import { serializeForJson } from "@/lib/core/http"

export const dynamic = "force-dynamic"

function sampleNormal(mean: number, std: number): number {
  if (std === 0) return mean
  // Box-Muller transform
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2)
  return mean + z * std
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const horizonMonths = Math.min(120, Math.max(12, parseInt(searchParams.get("months") ?? "60")))
  const N = 500

  const now = new Date()
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1)

  const [inflowTxs, outflowTxs, projection] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: { direction: "INFLOW", ignored: false, occurredAt: { gte: twelveMonthsAgo } },
      select: { amount: true, occurredAt: true },
    }),
    prisma.domainTransaction.findMany({
      where: { direction: "OUTFLOW", ignored: false, occurredAt: { gte: twelveMonthsAgo } },
      select: { amount: true, occurredAt: true },
    }),
    getProjectionPayload(),
  ])

  // Aggregate by month
  const incomeByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()

  for (const tx of inflowTxs) {
    const d = new Date(tx.occurredAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    incomeByMonth.set(key, (incomeByMonth.get(key) ?? 0) + Math.abs(Number(tx.amount)))
  }
  for (const tx of outflowTxs) {
    const d = new Date(tx.occurredAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    expenseByMonth.set(key, (expenseByMonth.get(key) ?? 0) + Math.abs(Number(tx.amount)))
  }

  const incomeValues = [...incomeByMonth.values()]
  const expenseValues = [...expenseByMonth.values()]

  function stats(values: number[]) {
    if (values.length === 0) return { mean: 0, std: 0 }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
    return { mean, std: Math.sqrt(variance) }
  }

  const incomeStats = stats(incomeValues)
  const expenseStats = stats(expenseValues)

  const currentBalance = projection.summary.currentBalance ?? 0

  // Generate labels for horizon months
  const labels: string[] = []
  for (let i = 1; i <= horizonMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    labels.push(d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }))
  }

  // Run N simulations
  const trajectories: number[][] = Array.from({ length: N }, () => {
    const traj: number[] = []
    let balance = currentBalance
    for (let m = 0; m < horizonMonths; m++) {
      const income = Math.max(0, sampleNormal(incomeStats.mean, incomeStats.std))
      const expense = Math.max(0, sampleNormal(expenseStats.mean, expenseStats.std))
      balance += income - expense
      traj.push(balance)
    }
    return traj
  })

  // Compute percentiles per month
  const series = labels.map((label, monthIdx) => {
    const monthValues = trajectories.map((t) => t[monthIdx]).sort((a, b) => a - b)
    return {
      label,
      p10: Math.round(percentile(monthValues, 10)),
      p25: Math.round(percentile(monthValues, 25)),
      p50: Math.round(percentile(monthValues, 50)),
      p75: Math.round(percentile(monthValues, 75)),
      p90: Math.round(percentile(monthValues, 90)),
    }
  })

  const lastMonthValues = trajectories.map((t) => t[horizonMonths - 1])
  const survivalRate = Math.round(
    (lastMonthValues.filter((v) => v > 0).length / N) * 100,
  )

  return NextResponse.json(
    serializeForJson({
      months: horizonMonths,
      n: N,
      survivalRate,
      meanIncome: Math.round(incomeStats.mean),
      meanExpenses: Math.round(expenseStats.mean),
      series,
    }),
  )
}
