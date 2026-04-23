import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"
import chalk from "chalk"

import { log } from "../core/logger.js"

interface AnalysisBundle {
  metadata?: { generatedAt?: string; filters?: { period?: string } }
  financial?: {
    overview?: Record<string, unknown>
    categories?: { results?: Array<{ name?: string; amount?: number; sharePercent?: number }> }
    merchants?: { results?: Array<{ name?: string; amount?: number; count?: number }> }
    recurring?: Array<{ id?: string; name?: string; amount?: number; type?: string }>
    crypto?: Record<string, unknown>
  }
}

function loadBundle(snapshotPath: string): AnalysisBundle {
  let resolved = snapshotPath
  // Allow either passing the directory or the bundle file directly.
  const stat = existsSync(snapshotPath)
  if (!stat) throw new Error(`Snapshot nao encontrado: ${snapshotPath}`)
  if (!snapshotPath.endsWith(".json")) {
    resolved = path.join(snapshotPath, "analysis-bundle.json")
  }
  if (!existsSync(resolved)) throw new Error(`analysis-bundle.json nao encontrado em ${snapshotPath}`)
  return JSON.parse(readFileSync(resolved, "utf-8")) as AnalysisBundle
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0)
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "" : "-"
  return `${sign}R$ ${Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDelta(beforeVal: unknown, afterVal: unknown): string {
  const b = num(beforeVal)
  const a = num(afterVal)
  const delta = a - b
  const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : null
  const arrow = delta > 0 ? chalk.red("▲") : delta < 0 ? chalk.green("▼") : chalk.dim("•")
  const pctStr = pct === null ? "n/d" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
  return `${fmtMoney(b)} -> ${fmtMoney(a)} ${arrow} ${fmtMoney(delta)} (${pctStr})`
}

function diffOverview(before: AnalysisBundle, after: AnalysisBundle) {
  const b = before.financial?.overview ?? {}
  const a = after.financial?.overview ?? {}
  const fields: Array<[string, string]> = [
    ["Saldo em conta", "accountBalance"],
    ["Investimentos", "investmentsTotal"],
    ["Crypto", "cryptoTotal"],
    ["Passivos", "liabilitiesTotal"],
    ["Patrimonio liquido", "netWorth"],
    ["Entradas (periodo)", "periodInflow"],
    ["Saidas (periodo)", "periodOutflow"],
    ["Resultado (periodo)", "periodNet"],
  ]
  log.heading("Overview")
  for (const [label, key] of fields) {
    console.log(`  ${chalk.dim(label.padEnd(22))} ${fmtDelta(b[key], a[key])}`)
  }
}

function diffTopList(
  label: string,
  beforeList: Array<{ name?: string; amount?: number }>,
  afterList: Array<{ name?: string; amount?: number }>
) {
  log.heading(label)
  const beforeMap = new Map(beforeList.map((x) => [x.name ?? "?", num(x.amount)]))
  const afterMap = new Map(afterList.map((x) => [x.name ?? "?", num(x.amount)]))

  const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()])
  const rows: Array<{ name: string; before: number; after: number; delta: number }> = []
  for (const name of allNames) {
    const before = beforeMap.get(name) ?? 0
    const after = afterMap.get(name) ?? 0
    rows.push({ name, before, after, delta: after - before })
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))

  for (const row of rows.slice(0, 10)) {
    const arrow = row.delta > 0 ? chalk.red("▲") : row.delta < 0 ? chalk.green("▼") : chalk.dim("•")
    const tag = row.before === 0 ? chalk.cyan(" [novo]") : row.after === 0 ? chalk.yellow(" [removido]") : ""
    console.log(`  ${row.name.padEnd(36).slice(0, 36)} ${fmtMoney(row.before)} -> ${fmtMoney(row.after)} ${arrow} ${fmtMoney(row.delta)}${tag}`)
  }
}

function diffRecurring(before: AnalysisBundle, after: AnalysisBundle) {
  const beforeList = before.financial?.recurring ?? []
  const afterList = after.financial?.recurring ?? []
  const beforeIds = new Set(beforeList.map((r) => r.id ?? r.name ?? ""))
  const afterIds = new Set(afterList.map((r) => r.id ?? r.name ?? ""))

  const added = afterList.filter((r) => !beforeIds.has(r.id ?? r.name ?? ""))
  const removed = beforeList.filter((r) => !afterIds.has(r.id ?? r.name ?? ""))

  log.heading("Recorrencias")
  console.log(`  Total: ${beforeList.length} -> ${afterList.length}`)
  if (added.length) {
    console.log(chalk.cyan(`  Novas (${added.length}):`))
    for (const r of added.slice(0, 10)) {
      console.log(`    + ${r.name ?? r.id} (${r.type ?? "?"}) ${fmtMoney(num(r.amount))}`)
    }
  }
  if (removed.length) {
    console.log(chalk.yellow(`  Removidas (${removed.length}):`))
    for (const r of removed.slice(0, 10)) {
      console.log(`    - ${r.name ?? r.id} (${r.type ?? "?"}) ${fmtMoney(num(r.amount))}`)
    }
  }
}

function diffCrypto(before: AnalysisBundle, after: AnalysisBundle) {
  const b = before.financial?.crypto ?? {}
  const a = after.financial?.crypto ?? {}
  log.heading("Crypto")
  console.log(`  ${chalk.dim("Valor total".padEnd(22))} ${fmtDelta(b.totalValue, a.totalValue)}`)
  console.log(`  ${chalk.dim("PnL nao realizado".padEnd(22))} ${fmtDelta(b.totalUnrealizedPnl, a.totalUnrealizedPnl)}`)
}

export const diffCommand = new Command("diff")
  .description("Compara dois snapshots e resume mudancas")
  .argument("<before>", "Caminho do snapshot anterior (diretorio ou .json)")
  .argument("<after>", "Caminho do snapshot mais novo (diretorio ou .json)")
  .action((beforePath: string, afterPath: string) => {
    log.heading("Gravel Diff")
    log.info(`Antes: ${beforePath}`)
    log.info(`Depois: ${afterPath}`)

    const before = loadBundle(beforePath)
    const after = loadBundle(afterPath)

    if (before.metadata?.generatedAt) log.dim(`  Antes: ${before.metadata.generatedAt}`)
    if (after.metadata?.generatedAt) log.dim(`  Depois: ${after.metadata.generatedAt}`)

    diffOverview(before, after)
    diffTopList(
      "Top categorias (variacao)",
      before.financial?.categories?.results ?? [],
      after.financial?.categories?.results ?? []
    )
    diffTopList(
      "Top merchants (variacao)",
      before.financial?.merchants?.results ?? [],
      after.financial?.merchants?.results ?? []
    )
    diffRecurring(before, after)
    diffCrypto(before, after)

    console.log()
    log.success("Diff concluido")
  })
