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
    handler: async () => {
      const metrics = await getOverviewMetrics()
      return metrics
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

      return {
        contas: accounts.map((account) => ({
          nome: account.nickname ?? account.name,
          instituicao: account.institutionName,
          tipo: account.kind,
          moeda: account.currencyCode,
          saldo: toNumber(account.balance),
          limite: account.creditLimit ? toNumber(account.creditLimit) : null,
          limite_disponivel: account.availableCreditLimit
            ? toNumber(account.availableCreditLimit)
            : null,
          limite_informado_em: account.creditDataAt,
        })),
        resumo_de_limite: creditSummary,
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
    handler: async () => getCardStatementsSummaryMetrics(),
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

      return transactions.map((transaction) => ({
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
