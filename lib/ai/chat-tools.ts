/**
 * Ferramentas do chat — Fase 1: **somente leitura**.
 *
 * Por que só leitura: o chat conversa com um modelo que pode estar rodando
 * fora desta máquina. Ferramenta que altera dado financeiro por texto livre,
 * sem confirmação na tela, é o tipo de coisa que só se percebe depois de
 * apagar um lançamento. Escrita é Fase 3, com confirmação explícita, e já
 * existe base para isso em `mcp/security.ts` (`WRITE_TOOLS`).
 *
 * Cada ferramenta devolve **campo curado**, não linha do banco: o resultado
 * ainda passa pelo guard (`sanitizeToolResult`), mas montar o objeto à mão é o
 * que garante que um campo novo no schema não vaze sozinho amanhã.
 */
import { getOverviewMetrics } from "@/lib/domain/analytics/overview"
import { getCardStatementsSummaryMetrics } from "@/lib/domain/billing"
import { getSpendingByCategoryMetrics } from "@/lib/domain/analytics/reports"
import { summarizeCreditLimits } from "@/lib/domain/credit"
import { getProjectionPayload } from "@/lib/domain/derived"
import { prisma } from "@/lib/prisma"

export type ChatToolSchema = {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

export type ChatToolHandler = (args: Record<string, unknown>) => Promise<unknown>

/** Reais no formato que o app usa. Existe para a ferramenta entregar frase pronta. */
function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clampLimit(value: unknown, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), max)
}

export const CHAT_TOOLS: Array<{ schema: ChatToolSchema; handler: ChatToolHandler }> = [
  {
    schema: {
      name: "visao_geral",
      description:
        "Números do mês corrente: entradas, saídas, saldo líquido, patrimônio e as maiores categorias de gasto. Use para qualquer pergunta do tipo 'como estou este mês'.",
      parameters: { type: "object", properties: {} },
    },
    // Antes esta ferramenta despejava o retorno inteiro de `getOverviewMetrics`
    // — quarenta campos, cotação, filtros aplicados — e **nenhuma categoria**,
    // apesar de a descrição prometer as maiores categorias de gasto. O modelo
    // procurou, não achou e inventou ("Mercado R$ 250, Restaurantes R$ 180"),
    // com saída real de R$ 813,74 no mês. Payload curado, promessa cumprida.
    handler: async () => {
      const [metrics, categories] = await Promise.all([
        getOverviewMetrics(),
        getSpendingByCategoryMetrics(new URLSearchParams({ period: "mtd", limit: "5" })),
      ])

      const maiores = categories.results.map((group) => ({
        categoria: group.name,
        gasto: toNumber(group.amount),
        participacao_percentual: toNumber(group.sharePercent),
      }))

      return {
        resposta_pronta: `No mês: entrou ${formatBrl(toNumber(metrics.monthlyInflow))}, saiu ${formatBrl(toNumber(metrics.monthlyOutflow))}, saldo do mês ${formatBrl(toNumber(metrics.monthlyNet))}. Patrimônio líquido: ${formatBrl(toNumber(metrics.netWorth))}.`,
        entradas_do_mes: toNumber(metrics.monthlyInflow),
        saidas_do_mes: toNumber(metrics.monthlyOutflow),
        saldo_do_mes: toNumber(metrics.monthlyNet),
        saldo_em_conta: toNumber(metrics.accountBalance),
        faturas_em_aberto: toNumber(metrics.openBills),
        patrimonio_liquido: toNumber(metrics.netWorth),
        maiores_categorias_do_mes: maiores,
        observacao:
          "Todos os valores já estão em reais e prontos. Não some nem converta nada.",
      }
    },
  },
  {
    schema: {
      name: "contas_e_limites",
      description:
        "Contas e cartões com saldo, e o limite de crédito de cada cartão mais a soma dos limites. Use para 'quanto tenho', 'qual meu limite', 'quanto de crédito me resta'.",
      parameters: { type: "object", properties: {} },
    },
    handler: async () => {
      const accounts = await prisma.domainAccount.findMany({
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          nickname: true,
          kind: true,
          currencyCode: true,
          balance: true,
          institutionName: true,
          creditLimit: true,
          availableCreditLimit: true,
          creditDataAt: true,
        },
      })

      const cards = accounts.filter((account) => account.kind === "CARD")
      const creditSummary = summarizeCreditLimits(
        cards.map((card) => ({
          id: card.id,
          name: card.nickname ?? card.name,
          creditLimit: card.creditLimit ? Number(card.creditLimit) : null,
          availableCreditLimit: card.availableCreditLimit
            ? Number(card.availableCreditLimit)
            : null,
          balance: card.balance ? Number(card.balance) : null,
          creditDataAt: card.creditDataAt,
        })),
      )

      // O total vai **pronto**, em português e com a conta já fechada.
      //
      // Na primeira versão o resumo saía com as chaves em inglês do
      // `CreditLimitSummary` no meio de um payload em português, e o modelo
      // barato do lab ignorou o campo e somou os cartões por conta própria —
      // esqueceu o Nubank e respondeu R$ 2.800 onde o certo era R$ 14.100.
      // Somar dinheiro não é trabalho do modelo: é trabalho da ferramenta.
      // O nome do cartão sozinho não identifica: ele tem um "gold" do Nubank e
      // um "GOLD" do Inter. Mandando só o nome, o modelo tratou os dois como o
      // mesmo cartão, jogou fora o de R$ 11.300 e respondeu R$ 2.800.
      const somados = cards
        .filter((card) => card.creditLimit && Number(card.creditLimit) > 0)
        .map((card) => ({
          nome: `${card.nickname ?? card.name}${card.institutionName ? ` (${card.institutionName})` : ""}`,
          limite: toNumber(card.creditLimit),
          limite_disponivel: card.availableCreditLimit
            ? toNumber(card.availableCreditLimit)
            : null,
        }))

      // Payload enxuto de propósito.
      //
      // O OmniRoute comprime **todo** request que passa por ele (engine
      // "stacked", ~17% em 2026-09-10). Para prosa isso é inofensivo; para um
      // JSON de 13 contas com números, não: o modelo passou a receber um
      // resumo com linhas faltando e respondeu R$ 2.800 onde o certo era
      // R$ 14.100. Quanto menor e mais repetido o essencial, menos sobra para
      // a compressão jogar fora. O total vem primeiro e em texto pronto.
      return {
        resposta_pronta: `Limite total: ${formatBrl(creditSummary.totalLimit)}. Disponível: ${formatBrl(creditSummary.totalAvailable)}. Usado: ${formatBrl(creditSummary.totalUsed)}.`,
        contas: accounts.map((account) => ({
          nome: account.nickname ?? account.name,
          instituicao: account.institutionName,
          tipo: account.kind,
          saldo: toNumber(account.balance),
          ...(account.creditLimit
            ? {
                limite: toNumber(account.creditLimit),
                limite_disponivel: account.availableCreditLimit
                  ? toNumber(account.availableCreditLimit)
                  : null,
              }
            : {}),
        })),
        resumo_de_limite: {
          limite_total: creditSummary.totalLimit,
          disponivel_total: creditSummary.totalAvailable,
          usado_total: creditSummary.totalUsed,
          uso_percentual: creditSummary.usedRatio,
          cartoes_somados: somados,
          quantidade_de_cartoes_somados: creditSummary.countedAccounts,
          cartoes_sem_limite_informado: creditSummary.missingLimitNames,
          cartoes_sem_disponivel_informado: creditSummary.missingAvailableNames,
          dado_mais_antigo_em: creditSummary.oldestDataAt,
          observacao:
            "limite_total e disponivel_total já são a soma de todos os cartões listados em cartoes_somados. Responda com esses números; não some de novo.",
        },
      }
    },
  },
  {
    schema: {
      name: "faturas",
      description:
        "Faturas de cartão: fatura atual, próximas e total em aberto por cartão. Use para 'quanto vou pagar', 'qual a fatura do mês'.",
      parameters: { type: "object", properties: {} },
    },
    // Mesmo motivo do `visao_geral`: o retorno cru traz cada fatura de cada
    // cartão com período, vencimento e status. Vai o essencial, com o total em
    // texto pronto — o resto o modelo não precisa para responder "quanto vou
    // pagar".
    handler: async () => {
      const summary = await getCardStatementsSummaryMetrics()
      return {
        resposta_pronta: `Em aberto: ${formatBrl(summary.openAmount)}. Vence nos próximos 7 dias: ${formatBrl(summary.dueIn7DaysAmount)}. Em atraso: ${formatBrl(summary.overdueAmount)}.`,
        total_em_aberto: summary.openAmount,
        vence_em_7_dias: summary.dueIn7DaysAmount,
        em_atraso: summary.overdueAmount,
        quantidades: summary.counts,
        faturas: summary.statements.slice(0, 8).map((card) => ({
          cartao: card.accountName,
          instituicao: card.institutionName,
          em_aberto_no_cartao: card.totalOpen,
          fatura_atual: card.current
            ? {
                valor: card.current.providerAmount ?? card.current.amount,
                vencimento: card.current.dueDate,
                situacao: card.current.status,
              }
            : null,
        })),
        observacao: "Valores já somados e em reais. Não some nem converta nada.",
      }
    },
  },
  {
    schema: {
      name: "transacoes_recentes",
      description:
        "Últimas transações, opcionalmente filtradas por texto na descrição ou no estabelecimento. Use para 'onde gastei', 'quanto foi aquela compra'.",
      parameters: {
        type: "object",
        properties: {
          busca: {
            type: "string",
            description: "Texto para filtrar descrição ou estabelecimento.",
          },
          limite: {
            type: "number",
            description: "Quantas transações trazer (1 a 50, padrão 20).",
          },
          direcao: {
            type: "string",
            description: "INFLOW para entradas, OUTFLOW para saídas.",
            enum: ["INFLOW", "OUTFLOW"],
          },
        },
      },
    },
    handler: async (args) => {
      const search = typeof args.busca === "string" ? args.busca.trim() : ""
      const take = clampLimit(args.limite, 20, 50)
      const direction =
        args.direcao === "INFLOW" || args.direcao === "OUTFLOW" ? args.direcao : undefined

      const transactions = await prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          ...(direction ? { direction } : {}),
          ...(search
            ? {
                OR: [
                  { description: { contains: search } },
                  { domainMerchant: { displayName: { contains: search } } },
                ],
              }
            : {}),
        },
        orderBy: { occurredAt: "desc" },
        take,
        select: {
          occurredAt: true,
          description: true,
          amount: true,
          direction: true,
          currencyCode: true,
          domainCategory: { select: { name: true } },
          domainMerchant: { select: { displayName: true } },
          domainAccount: { select: { name: true, nickname: true } },
        },
      })

      const itens = transactions.map((transaction) => ({
        data: transaction.occurredAt,
        descricao: transaction.description,
        valor: toNumber(transaction.amount),
        direcao: transaction.direction,
        moeda: transaction.currencyCode,
        categoria: transaction.domainCategory?.name ?? null,
        estabelecimento: transaction.domainMerchant?.displayName ?? null,
        conta:
          transaction.domainAccount?.nickname ?? transaction.domainAccount?.name ?? null,
      }))

      // A soma vai pronta: "quanto gastei nisso" é a pergunta mais comum sobre
      // uma lista, e somar linha a linha é justamente onde o modelo erra.
      const totalListado = itens.reduce((sum, item) => sum + Math.abs(item.valor), 0)

      return {
        resposta_pronta: `${itens.length} lançamento(s) encontrados, somando ${formatBrl(totalListado)}.`,
        quantidade: itens.length,
        soma_dos_listados: Math.round(totalListado * 100) / 100,
        itens,
        observacao:
          "soma_dos_listados já é o total desta lista. Não some os itens de novo.",
      }
    },
  },
  {
    schema: {
      name: "projecao",
      description:
        "Projeção de caixa dos próximos meses, com o que já é conhecido (recorrências, faturas, parcelas). Use para 'sobra quanto', 'dá para comprar'.",
      parameters: { type: "object", properties: {} },
    },
    handler: async () => getProjectionPayload(),
  },
  {
    schema: {
      name: "metas",
      description: "Metas financeiras ativas, com valor alvo e progresso.",
      parameters: { type: "object", properties: {} },
    },
    handler: async () => {
      const goals = await prisma.goal.findMany({
        where: { active: true },
        select: { name: true, targetAmount: true, currentAmount: true, targetDate: true },
      })
      return goals.map((goal) => ({
        nome: goal.name,
        alvo: toNumber(goal.targetAmount),
        atual: toNumber(goal.currentAmount),
        prazo: goal.targetDate,
      }))
    },
  },
]

export const CHAT_TOOL_SCHEMAS = CHAT_TOOLS.map((tool) => tool.schema)

const HANDLERS = new Map(CHAT_TOOLS.map((tool) => [tool.schema.name, tool.handler]))

export function isKnownChatTool(name: string) {
  return HANDLERS.has(name)
}

/**
 * Executa uma ferramenta pelo nome.
 *
 * Nome desconhecido devolve erro em vez de lançar: modelo inventa nome de
 * ferramenta com frequência, e derrubar a conversa por isso seria pior que
 * dizer a ele que aquilo não existe.
 */
export async function runChatTool(name: string, args: Record<string, unknown>) {
  const handler = HANDLERS.get(name)
  if (!handler) {
    return { erro: `Ferramenta desconhecida: ${name}`, ferramentas: [...HANDLERS.keys()] }
  }
  try {
    return await handler(args ?? {})
  } catch (error) {
    return {
      erro: "A ferramenta falhou.",
      detalhe: error instanceof Error ? error.message : String(error),
    }
  }
}
