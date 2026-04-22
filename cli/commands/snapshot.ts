import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"

import { log } from "../core/logger.js"
import { DEFAULT_OUTPUT_DIR } from "../core/paths.js"
import { serializeDecimal } from "../core/serialize.js"

type PeriodKey = "mtd" | "30d" | "90d" | "180d" | "12m" | "ytd" | "all"

function buildSearchParams(period: PeriodKey): URLSearchParams {
  return new URLSearchParams({ period })
}

export const snapshotCommand = new Command("snapshot")
  .description("Gera snapshots de dados para analise por IA")

snapshotCommand
  .command("finance")
  .description("Snapshot financeiro completo")
  .option("-p, --period <period>", "Periodo (mtd|30d|90d|180d|12m|ytd|all)", "90d")
  .option("-o, --out <dir>", "Diretorio de saida")
  .option("--format <fmt>", "Formato (bundle|json|md|all)", "all")
  .option("--limit-transactions <n>", "Limite de transacoes", "500")
  .option("--top <n>", "Top N categorias/merchants", "20")
  .option("--for-llm", "Prepara um pacote reduzido otimizado para colar em LLMs")
  .action(async (options) => {
    const period = options.period as PeriodKey
    const topN = Number(options.top)
    const txLimit = Number(options.limitTransactions)
    const isForLLM = !!options.forLlm

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const outDir = options.out ?? path.join(DEFAULT_OUTPUT_DIR, timestamp)
    mkdirSync(outDir, { recursive: true })
    mkdirSync(path.join(outDir, "entities"), { recursive: true })

    log.heading("Gravel Snapshot: Finance")
    log.info(`Periodo: ${period}`)
    log.info(`Saida: ${outDir}`)
    if (isForLLM) log.info("Modo --for-llm ativado: contexto reduzido.")
    console.log()

    const params = buildSearchParams(period)
    const paramsWithTop = new URLSearchParams(params)
    paramsWithTop.set("limit", String(topN))

    // Import domain modules
    const { getOverviewMetrics, getCashFlowMetrics, getSpendingByCategoryMetrics, getSpendingByMerchantMetrics, getBillsSummaryMetrics, getCryptoPortfolioMetrics, getCryptoAssetMetrics } = await import("@/lib/domain/analytics")
    const { getRecurringPayload, getProjectionPayload, getPortfolioPayload } = await import("@/lib/domain/derived")
    const { getDomainTransactions, getDomainCategories, getDomainMerchants, getDomainAccounts, getDomainBills } = await import("@/lib/domain/queries")
    const { prisma } = await import("@/lib/prisma")
    const { collectAnomalies } = await import("../collectors/anomalies.js")

    // Collect data
    log.info("Coletando overview...")
    const overview = serializeDecimal(await getOverviewMetrics(params))

    log.info("Coletando cash flow...")
    const cashFlow = serializeDecimal(await getCashFlowMetrics(params))

    log.info("Coletando categorias...")
    const categories = serializeDecimal(await getSpendingByCategoryMetrics(paramsWithTop))
    const rawCategories = serializeDecimal(await getDomainCategories(new URLSearchParams()))

    log.info("Coletando merchants...")
    const merchants = serializeDecimal(await getSpendingByMerchantMetrics(paramsWithTop))
    const rawMerchants = serializeDecimal(await getDomainMerchants(new URLSearchParams()))

    log.info("Coletando faturas...")
    const billsSummary = serializeDecimal(await getBillsSummaryMetrics(params))
    const rawBills = serializeDecimal(await getDomainBills(new URLSearchParams()))

    log.info("Coletando contas...")
    const rawAccounts = serializeDecimal(await getDomainAccounts(new URLSearchParams()))

    log.info("Coletando recorrencias...")
    const recurring = serializeDecimal(await getRecurringPayload())

    log.info("Coletando portfolio...")
    const portfolio = serializeDecimal(await getPortfolioPayload())

    log.info("Coletando crypto...")
    const crypto = serializeDecimal(await getCryptoPortfolioMetrics(new URLSearchParams({ period: "all" })))
    const rawCrypto = serializeDecimal(await getCryptoAssetMetrics(new URLSearchParams({ period: "all" })))

    log.info("Coletando projecao...")
    const projection = serializeDecimal(await getProjectionPayload())

    log.info("Coletando transacoes...")
    const txParams = new URLSearchParams(params)
    txParams.set("pageSize", String(txLimit))
    const transactions = serializeDecimal(await getDomainTransactions(txParams))

    log.info("Analisando anomalias...")
    const anomalies = serializeDecimal(await collectAnomalies(params))

    // Build bundle
    const bundle = {
      metadata: {
        generatedAt: new Date().toISOString(),
        project: "gravel",
        version: "0.1.0",
        filters: { period },
        optimizedForLLM: isForLLM
      },
      financial: {
        overview,
        cashFlow,
        categories: isForLLM ? (categories as any).results.slice(0, 10) : categories,
        merchants: isForLLM ? (merchants as any).results.slice(0, 10) : merchants,
        bills: billsSummary,
        recurring,
        portfolio: isForLLM ? undefined : portfolio,
        crypto,
        projection: isForLLM ? undefined : projection,
      },
      evidence: {
        transactionCount: (transactions as any)?.total ?? 0,
        anomalies,
      },
    }

    const fmt = options.format

    // Write bundle JSON
    if (fmt === "bundle" || fmt === "json" || fmt === "all") {
      const bundlePath = path.join(outDir, "analysis-bundle.json")
      writeFileSync(bundlePath, JSON.stringify(bundle, null, 2))
      log.success(`Bundle: ${bundlePath}`)
    }

    // Write JSONL entities
    if (fmt === "all" && !isForLLM) {
      const writers = [
        { name: "transactions", data: (transactions as any)?.results ?? [] },
        { name: "categories", data: (rawCategories as any)?.results ?? [] },
        { name: "merchants", data: (rawMerchants as any)?.results ?? [] },
        { name: "bills", data: (rawBills as any)?.results ?? [] },
        { name: "accounts", data: (rawAccounts as any)?.results ?? [] },
        { name: "recurring", data: recurring ?? [] },
        { name: "crypto-assets", data: (rawCrypto as any)?.results ?? [] },
      ]

      for (const w of writers) {
        if (!w.data || w.data.length === 0) continue
        const filepath = path.join(outDir, `entities/${w.name}.jsonl`)
        writeFileSync(filepath, w.data.map((item: any) => JSON.stringify(item)).join("\n"))
      }
      log.success(`Entities: Gerados ${writers.length} arquivos JSONL`)
    }

    // Write prompt-context.md for LLM
    if (isForLLM || fmt === "all") {
      const o = overview as any
      const md = [
        "# Gravel Finance - Contexto para Analise de IA",
        "",
        `> Gerado em ${new Date().toISOString()} | Periodo: ${period}`,
        "",
        "Voce atua como um consultor financeiro. Abaixo esta o contexto atual do usuario.",
        "",
        "## Visao Geral",
        `- **Saldo Liquido:** R$ ${(o?.accountBalance ?? 0).toFixed(2)}`,
        `- **Investimentos (Fiat):** R$ ${(o?.investmentsTotal ?? 0).toFixed(2)}`,
        `- **Crypto:** R$ ${(o?.cryptoTotal ?? 0).toFixed(2)}`,
        `- **Passivos:** R$ ${(o?.liabilitiesTotal ?? 0).toFixed(2)}`,
        `- **Patrimonio Liquido Total:** R$ ${(o?.netWorth ?? 0).toFixed(2)}`,
        "",
        "## Fluxo de Caixa no Periodo",
        `- **Entradas:** R$ ${(o?.periodInflow ?? 0).toFixed(2)}`,
        `- **Saidas:** R$ ${(o?.periodOutflow ?? 0).toFixed(2)}`,
        `- **Resultado Liquido:** R$ ${(o?.periodNet ?? 0).toFixed(2)}`,
        "",
        "## Anomalias e Alertas Detectados",
        anomalies.length === 0 
          ? "Nenhuma anomalia grave detectada."
          : (anomalies as any[]).map(a => `- **[${a.severity.toUpperCase()}] ${a.type}:** ${a.description}`).join("\n"),
        "",
        "## Resumo de Categorias (Top 10)",
        ...((categories as any)?.results?.slice(0, 10) ?? []).map(
          (c: any, i: number) =>
            `${i + 1}. **${c.name}** - R$ ${(c.amount ?? 0).toFixed(2)} (${(c.sharePercent ?? 0).toFixed(1)}%)`
        ),
        "",
        "## Instrucoes para Analise",
        "1. Identifique os principais vazoes de capital e sugira ajustes.",
        "2. Fique atento as anomalias detectadas (ex: gastos muito altos sem categoria ou faturas em atraso).",
        "3. Ofereca um parecer sobre a saude financeira atual."
      ].join("\n")

      const mdPath = path.join(outDir, "prompt-context.md")
      writeFileSync(mdPath, md)
      log.success(`Prompt Context: ${mdPath}`)
    }

    // Write manifest
    const manifest = {
      generatedAt: new Date().toISOString(),
      period,
      format: fmt,
      forLlm: isForLLM,
      outputDir: outDir,
    }
    writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))

    await prisma.$disconnect()

    console.log()
    log.success(`Snapshot completo em ${outDir}`)
  })
