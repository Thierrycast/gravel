import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"

import { log } from "../core/logger.js"

interface PromptPackOptions {
  input: string
  out?: string
}

interface AnalysisBundle {
  metadata?: {
    generatedAt?: string
    project?: string
    filters?: { period?: string; from?: string; to?: string }
  }
  financial?: {
    overview?: Record<string, unknown>
    cashFlow?: Record<string, unknown>
    categories?: { results?: Array<Record<string, unknown>> }
    merchants?: { results?: Array<Record<string, unknown>> }
    bills?: Record<string, unknown>
    recurring?: Array<Record<string, unknown>>
    portfolio?: Record<string, unknown>
    crypto?: Record<string, unknown>
    projection?: Record<string, unknown>
  }
  evidence?: {
    transactionCount?: number
    topCategories?: Array<Record<string, unknown>>
    topMerchants?: Array<Record<string, unknown>>
  }
}

function fmtMoney(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value ?? 0)
  if (!Number.isFinite(num)) return "R$ 0,00"
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildSystemContext(bundle: AnalysisBundle): string {
  const period = bundle.metadata?.filters?.period ?? "n/d"
  const generatedAt = bundle.metadata?.generatedAt ?? new Date().toISOString()
  return [
    "# Gravel Finance - Contexto do sistema",
    "",
    `> Gerado em ${generatedAt}`,
    "",
    "Voce esta analisando um snapshot do app Gravel Finance, um agregador financeiro pessoal",
    "que consome dados do Pluggy (contas brasileiras) e Binance (cripto). Os dados estao",
    "consolidados em um modelo de dominio (DomainAccount, DomainTransaction, DomainBill,",
    "DomainCategory, DomainMerchant, DomainInvestment, DomainCryptoAsset).",
    "",
    "## Convencoes",
    "",
    "- Valores monetarios em BRL.",
    "- Transacoes com `direction = INFLOW` sao entradas. `OUTFLOW` sao saidas.",
    "- Contas tipo CARD com saldo negativo sao passivos (cartao). CARD com saldo positivo",
    "  sao carteiras digitais (ex: Mercado Pago, ouro).",
    "- Categorias 'Transferência entre contas' e 'Pagamento de fatura' nao sao gasto real.",
    "- Patrimonio liquido = ativos liquidos + investimentos + cripto - passivos.",
    "",
    "## Periodo analisado",
    "",
    `- Filtro: \`${period}\``,
    bundle.metadata?.filters?.from ? `- De: ${bundle.metadata.filters.from}` : "",
    bundle.metadata?.filters?.to ? `- Ate: ${bundle.metadata.filters.to}` : "",
    "",
  ]
    .filter(Boolean)
    .join("\n")
}

function buildAnalysisBrief(bundle: AnalysisBundle): string {
  const o = bundle.financial?.overview as Record<string, unknown> | undefined
  const cats = bundle.financial?.categories?.results ?? []
  const merchs = bundle.financial?.merchants?.results ?? []

  return [
    "# Briefing de analise",
    "",
    "## Snapshot financeiro",
    "",
    `- Saldo em conta: ${fmtMoney(o?.accountBalance)}`,
    `- Investimentos: ${fmtMoney(o?.investmentsTotal)}`,
    `- Crypto: ${fmtMoney(o?.cryptoTotal)}`,
    `- Passivos: ${fmtMoney(o?.liabilitiesTotal)}`,
    `- Patrimonio liquido: ${fmtMoney(o?.netWorth)}`,
    "",
    "## Fluxo do periodo",
    "",
    `- Entradas: ${fmtMoney(o?.periodInflow)}`,
    `- Saidas: ${fmtMoney(o?.periodOutflow)}`,
    `- Resultado: ${fmtMoney(o?.periodNet)}`,
    "",
    "## Top 5 categorias de gasto",
    "",
    ...cats.slice(0, 5).map((c, i) => {
      const name = c.name ?? "(sem nome)"
      const amount = fmtMoney(c.amount)
      const share = typeof c.sharePercent === "number" ? c.sharePercent.toFixed(1) : "0.0"
      return `${i + 1}. ${name} - ${amount} (${share}%)`
    }),
    "",
    "## Top 5 merchants",
    "",
    ...merchs.slice(0, 5).map((m, i) => {
      const name = m.name ?? "(sem nome)"
      const amount = fmtMoney(m.amount)
      const count = m.count ?? 0
      return `${i + 1}. ${name} - ${amount} (${count} transacoes)`
    }),
    "",
  ].join("\n")
}

function buildQuestionStarters(): string {
  return [
    "# Perguntas sugeridas para o agente",
    "",
    "## Saude financeira",
    "",
    "- Qual e a tendencia do meu patrimonio liquido nos ultimos periodos?",
    "- Em que categorias estou gastando mais do que deveria?",
    "- Existem merchants recorrentes com gastos crescentes?",
    "",
    "## Recorrencia",
    "",
    "- Quais entradas sao recorrentes e qual a previsibilidade delas?",
    "- Existem assinaturas que parecem ter sido esquecidas?",
    "",
    "## Cripto e investimentos",
    "",
    "- Como esta o PnL nao realizado por ativo?",
    "- Existe concentracao excessiva em um ativo?",
    "",
    "## Operacao",
    "",
    "- Algum sync recente falhou ou esta atrasado?",
    "- Existem locks ativos ou contas sem atualizacao recente?",
    "",
  ].join("\n")
}

function buildEvidenceIndex(bundle: AnalysisBundle): unknown {
  return {
    metadata: bundle.metadata ?? {},
    counts: {
      transactions: bundle.evidence?.transactionCount ?? 0,
      categories: bundle.financial?.categories?.results?.length ?? 0,
      merchants: bundle.financial?.merchants?.results?.length ?? 0,
      recurring: bundle.financial?.recurring?.length ?? 0,
    },
    topCategories: bundle.evidence?.topCategories ?? [],
    topMerchants: bundle.evidence?.topMerchants ?? [],
    references: {
      bundle: "analysis-bundle.json",
      transactions: "entities/transactions.jsonl",
      summary: "summary.md",
    },
  }
}

export const promptPackCommand = new Command("prompt-pack")
  .description("Gera um pacote de prompts otimizado para IA a partir de um analysis-bundle.json")
  .requiredOption("-i, --input <file>", "Caminho para analysis-bundle.json")
  .option("-o, --out <dir>", "Diretorio de saida (default ao lado do input)")
  .action((options: PromptPackOptions) => {
    const inputPath = path.resolve(options.input)
    const outDir = options.out ? path.resolve(options.out) : path.join(path.dirname(inputPath), "prompt-pack")

    log.info(`Lendo bundle: ${inputPath}`)
    const raw = readFileSync(inputPath, "utf-8")
    const bundle = JSON.parse(raw) as AnalysisBundle

    mkdirSync(outDir, { recursive: true })

    const systemContextPath = path.join(outDir, "system-context.md")
    writeFileSync(systemContextPath, buildSystemContext(bundle))
    log.success(`system-context.md`)

    const briefPath = path.join(outDir, "analysis-brief.md")
    writeFileSync(briefPath, buildAnalysisBrief(bundle))
    log.success(`analysis-brief.md`)

    const startersPath = path.join(outDir, "question-starters.md")
    writeFileSync(startersPath, buildQuestionStarters())
    log.success(`question-starters.md`)

    const indexPath = path.join(outDir, "evidence-index.json")
    writeFileSync(indexPath, JSON.stringify(buildEvidenceIndex(bundle), null, 2))
    log.success(`evidence-index.json`)

    log.success(`Prompt-pack pronto em ${outDir}`)
  })
