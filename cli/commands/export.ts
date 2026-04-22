import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"

import { log } from "../core/logger.js"
import { serializeDecimal } from "../core/serialize.js"

type EntityKind =
  | "transactions"
  | "categories"
  | "merchants"
  | "bills"
  | "recurring"
  | "portfolio"
  | "crypto"
  | "accounts"
  | "investments"

type Format = "json" | "jsonl"

interface ExportOptions {
  period: string
  from?: string
  to?: string
  format: Format
  out?: string
  limit?: string
  pageSize?: string
}

async function fetchEntity(kind: EntityKind, params: URLSearchParams): Promise<unknown> {
  const queries = await import("@/lib/domain/queries")
  const derived = await import("@/lib/domain/derived")
  switch (kind) {
    case "transactions":
      return queries.getDomainTransactions(params)
    case "categories":
      return queries.getDomainCategories(params)
    case "merchants":
      return queries.getDomainMerchants(params)
    case "bills":
      return queries.getDomainBills(params)
    case "accounts":
      return queries.getDomainAccounts(params)
    case "investments":
      return queries.getDomainInvestments(params)
    case "recurring":
      return derived.getRecurringPayload()
    case "portfolio":
      return derived.getPortfolioPayload()
    case "crypto":
      return queries.getDomainCryptoAssets(params)
  }
}

function pickResults(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object" && "results" in payload) {
    const results = (payload as { results: unknown }).results
    if (Array.isArray(results)) return results
  }
  if (payload && typeof payload === "object") return [payload]
  return []
}

function writeOutput(rows: unknown[], format: Format, outPath: string) {
  mkdirSync(path.dirname(outPath), { recursive: true })
  if (format === "jsonl") {
    const lines = rows.map((row) => JSON.stringify(row)).join("\n")
    writeFileSync(outPath, lines + (rows.length > 0 ? "\n" : ""))
  } else {
    writeFileSync(outPath, JSON.stringify(rows, null, 2))
  }
}

function buildExportSubcommand(kind: EntityKind, defaultName: string) {
  return new Command(kind)
    .description(`Exporta ${kind} para JSON ou JSONL`)
    .option("-p, --period <period>", "Periodo (mtd|30d|90d|180d|12m|ytd|all|custom)", "all")
    .option("--from <date>", "Data inicial (YYYY-MM-DD)")
    .option("--to <date>", "Data final (YYYY-MM-DD)")
    .option("--format <fmt>", "Formato (json|jsonl)", "jsonl")
    .option("-o, --out <file>", "Caminho do arquivo de saida")
    .option("--limit <n>", "Limite (alias de pageSize)")
    .option("--page-size <n>", "Page size para paginacao", "1000")
    .action(async (options: ExportOptions) => {
      const params = new URLSearchParams({ period: options.period })
      if (options.from) params.set("from", options.from)
      if (options.to) params.set("to", options.to)
      
      const pageSize = options.limit ?? options.pageSize ?? "1000"
      params.set("pageSize", pageSize)

      const outPath = options.out ?? path.join(".ai/exports", defaultName)
      log.info(`Exportando ${kind} (period=${options.period})`)

      const raw = await fetchEntity(kind, params)
      const serialized = serializeDecimal(raw)
      const rows = pickResults(serialized)
      writeOutput(rows, options.format, outPath)

      log.success(`${rows.length} registros -> ${outPath}`)

      const { prisma } = await import("@/lib/prisma")
      await prisma.$disconnect()
    })
}

export const exportCommand = new Command("export").description(
  "Exporta entidades do dominio para pipelines externos"
)

exportCommand.addCommand(buildExportSubcommand("transactions", "transactions.jsonl"))
exportCommand.addCommand(buildExportSubcommand("categories", "categories.jsonl"))
exportCommand.addCommand(buildExportSubcommand("merchants", "merchants.jsonl"))
exportCommand.addCommand(buildExportSubcommand("bills", "bills.jsonl"))
exportCommand.addCommand(buildExportSubcommand("accounts", "accounts.jsonl"))
exportCommand.addCommand(buildExportSubcommand("investments", "investments.jsonl"))
exportCommand.addCommand(buildExportSubcommand("recurring", "recurring.jsonl"))
exportCommand.addCommand(buildExportSubcommand("portfolio", "portfolio.json"))
exportCommand.addCommand(buildExportSubcommand("crypto", "crypto.jsonl"))
