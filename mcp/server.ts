import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DomainCategoryKind,
  DomainTransactionDirection,
  SourceProvider,
  Prisma,
} from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { normalizeText } from "../lib/domain/utils.js";

import { serializeDecimal } from "../cli/core/serialize.js";
import {
  getOverviewMetrics,
  getNetWorthMetrics,
  getCashFlowMetrics,
  getCashFlowComparisonMetrics,
  getSpendingByCategoryMetrics,
  getSpendingByMerchantMetrics,
  getSpendingTrendsMetrics,
  getCryptoPortfolioMetrics,
  getCryptoAssetMetrics,
} from "../lib/domain/analytics.js";
import { getCardStatementsSummaryMetrics } from "../lib/domain/billing.js";
import {
  getRecurringPayload,
  getProjectionPayload,
} from "../lib/domain/derived.js";
import {
  getDomainTransactions,
  getDomainAccounts,
  getDomainInvestments,
  getDomainGoals,
  getDomainScenarios,
  getUserSettings,
  getGoalHistory,
} from "../lib/domain/queries.js";
import {
  completeMonthlyClose,
  currentMonthKey,
  getInboxPayload,
  getMonthlyClosePayload,
  setInboxItemStatus,
  setMonthlyCloseStep,
} from "../lib/domain/review.js";

/**
 * Gravel Finance MCP Server
 * Exposes financial tools to AI agents using the Model Context Protocol.
 */

function createServer() {
  const server = new Server(
    {
      name: "gravel-finance",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );


const TOOLS: Tool[] = [
  {
    name: "get_financial_snapshot",
    description: "Retorna snapshot financeiro completo: patrimônio, entradas, saídas, saldo",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Período (mtd|ytd|last30|last3months|last6months|last12months|YYYY-MM)",
          default: "mtd",
        },
      },
    },
  },
  {
    name: "get_net_worth_history",
    description: "Retorna o histórico do patrimônio líquido mês a mês",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Período (12m|6m|3m)",
          default: "12m",
        },
      },
    },
  },
  {
    name: "get_cashflow",
    description: "Fluxo de caixa por dia ou mês",
    inputSchema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "Período (mtd|ytd|last12months)",
          default: "mtd",
        },
        groupBy: {
          type: "string",
          enum: ["day", "month"],
          default: "month",
        },
      },
    },
  },
  {
    name: "get_cashflow_comparison",
    description: "Comparação de fluxo de caixa entre meses consecutivos",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", default: 2 },
        periodType: { type: "string", enum: ["month", "week", "quarter"], default: "month" },
      },
    },
  },
  {
    name: "get_spending_by_category",
    description: "Gastos do período agrupados por categoria com % de participação",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", default: "mtd" },
        limit: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "get_spending_by_merchant",
    description: "Top estabelecimentos por gasto no período",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", default: "mtd" },
        limit: { type: "number", default: 12 },
      },
    },
  },
  {
    name: "get_spending_trends",
    description: "Tendência de gasto por categoria ao longo do tempo",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", default: "last6months" },
      },
    },
  },
  {
    name: "search_transactions",
    description: "Busca transações por período, categoria, direção, conta, comerciantes, valores e texto",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Termo de busca" },
        period: { type: "string", description: "Atalho de período (mtd|30d|90d|180d|12m|ytd|all)" },
        from: { type: "string", description: "Data inicial (YYYY-MM-DD)" },
        to: { type: "string", description: "Data final (YYYY-MM-DD)" },
        direction: { type: "string", enum: ["INFLOW", "OUTFLOW", "TRANSFER"], description: "Direção da transação" },
        accountId: { type: "string", description: "Filtrar por ID da conta" },
        categoryId: { type: "string", description: "Filtrar por ID da categoria" },
        merchantId: { type: "string", description: "Filtrar por ID do comerciante" },
        minAmount: { type: "number", description: "Valor mínimo" },
        maxAmount: { type: "number", description: "Valor máximo" },
        sortBy: { type: "string", description: "Ordenar por campo (ex: occurredAt, amount)" },
        sortOrder: { type: "string", enum: ["asc", "desc"], default: "desc", description: "Ordem da ordenação" },
        page: { type: "number", default: 1, description: "Número da página" },
        pageSize: { type: "number", default: 50, description: "Itens por página" },
      },
    },
  },
  {
    name: "get_accounts",
    description: "Lista de contas com saldo e distribuição percentual",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_bills",
    description: "Faturas de cartão do mês com status (aberta/vencida/paga)",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
      },
    },
  },
  {
    name: "get_investments",
    description: "Lista de ativos de renda fixa e variável",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_crypto_portfolio",
    description: "Portfólio cripto com quantidade, preço atual, custo e P&L por ativo",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_recurring_expenses",
    description: "Despesas recorrentes e parcelamentos com projeção mensal futura",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_insights",
    description: "Insights automáticos, alertas e análise forense (Benford + assinaturas ocultas)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_goals",
    description: "Metas financeiras com progresso e datas alvo",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_scenarios",
    description: "Cenários de planejamento e simulações (aumentos, compras, etc)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "analyze_financial_health",
    description: "Análise completa de saúde financeira: score, alertas, tendências e indicadores de runway",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "compare_periods",
    description: "Comparação detalhada entre dois períodos financeiros",
    inputSchema: {
      type: "object",
      properties: {
        period1: { type: "string", default: "mtd" },
        period2: { type: "string", default: "lastMonth" },
      },
    },
  },
  {
    name: "project_future_cashflow",
    description: "Projeção de fluxo de caixa baseado em recorrências e salário efetivo",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_financial_inbox",
    description: "Lista pendências acionáveis da Inbox Financeira",
    inputSchema: {
      type: "object",
      properties: {
        includeClosed: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "set_financial_inbox_item_status",
    description: "Marca item da Inbox como open, resolved ou ignored",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["open", "resolved", "ignored"] },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "get_monthly_close",
    description: "Retorna checklist e resumo do fechamento do mês",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
      },
    },
  },
  {
    name: "set_monthly_close_step",
    description: "Marca uma etapa do fechamento mensal como concluída ou aberta",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        stepId: { type: "string" },
        completed: { type: "boolean", default: true },
      },
      required: ["stepId"],
    },
  },
  {
    name: "complete_monthly_close",
    description: "Persiste o resumo final do fechamento mensal",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
      },
    },
  },
  {
    name: "create_transaction",
    description: "Cria uma transação manual (MANUAL inflow/outflow)",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Descrição da transação" },
        amount: { type: "number", description: "Valor positivo" },
        direction: { type: "string", enum: ["INFLOW", "OUTFLOW"], description: "Direção da transação" },
        occurredAt: { type: "string", description: "Data/Hora ISO (opcional, padrão agora)" },
        domainAccountId: { type: "string", description: "ID da conta associada (opcional)" },
        domainCategoryId: { type: "string", description: "ID da categoria associada (opcional)" },
      },
      required: ["description", "amount", "direction"],
    },
  },
  {
    name: "update_transaction",
    description: "Atualiza campos de uma transação existente",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da transação" },
        description: { type: "string", description: "Nova descrição" },
        amount: { type: "number", description: "Novo valor" },
        direction: { type: "string", enum: ["INFLOW", "OUTFLOW", "TRANSFER"], description: "Nova direção" },
        occurredAt: { type: "string", description: "Nova data/hora ISO" },
        domainCategoryId: { type: "string", description: "Novo ID da categoria" },
        domainMerchantId: { type: "string", description: "Novo ID do comerciante" },
        merchantName: { type: "string", description: "Nome do comerciante para vincular/criar" },
        ignored: { type: "boolean", description: "Marcar como ignorada ou ativa" },
        markInternalTransfer: { type: "boolean", description: "Marcar como transferência interna" },
        markAsSalary: { type: "boolean", description: "Marcar como salário" },
        markAsInvestment: { type: "boolean", description: "Marcar como investimento" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_transaction",
    description: "Exclui uma transação manual pelo ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da transação" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_account",
    description: "Atualiza apelido, nome ou saldo de uma conta manual",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da conta" },
        name: { type: "string", description: "Novo nome" },
        nickname: { type: "string", description: "Novo apelido" },
        balance: { type: "number", description: "Novo saldo manual" },
      },
      required: ["id"],
    },
  },
  {
    name: "pay_bill",
    description: "Marca uma fatura de cartão de crédito como paga",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da fatura" },
        status: { type: "string", enum: ["PAID", "OPEN", "OVERDUE"], default: "PAID", description: "Status de pagamento" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_goal",
    description: "Cria uma nova meta financeira",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da meta" },
        targetAmount: { type: "number", description: "Valor alvo" },
        emoji: { type: "string", description: "Emoji representativo" },
        currentAmount: { type: "number", description: "Valor já economizado" },
        monthlyContribution: { type: "number", description: "Contribuição mensal pretendida" },
        targetDate: { type: "string", description: "Data limite YYYY-MM-DD (opcional)" },
        matchCategorySlug: { type: "string", description: "Slug da categoria para aportes automáticos (opcional)" },
        matchKeyword: { type: "string", description: "Palavra-chave para aportes automáticos (opcional)" },
        matchDateStart: { type: "string", description: "Data de início dos aportes automáticos YYYY-MM-DD (opcional)" },
      },
      required: ["name", "targetAmount"],
    },
  },
  {
    name: "update_goal",
    description: "Atualiza campos de uma meta financeira",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da meta" },
        name: { type: "string", description: "Novo nome" },
        targetAmount: { type: "number", description: "Novo valor alvo" },
        emoji: { type: "string", description: "Novo emoji" },
        currentAmount: { type: "number", description: "Novo valor economizado" },
        monthlyContribution: { type: "number", description: "Nova contribuição mensal" },
        targetDate: { type: "string", description: "Nova data limite YYYY-MM-DD" },
        active: { type: "boolean", description: "Marcar como ativa ou inativa" },
        matchCategorySlug: { type: "string", description: "Novo slug de categoria de match" },
        matchKeyword: { type: "string", description: "Nova palavra-chave de match" },
        matchDateStart: { type: "string", description: "Nova data de início de match YYYY-MM-DD" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_scenario",
    description: "Cria um cenário de simulação/planejamento futuro",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da simulação" },
        amount: { type: "number", description: "Valor (positivo para receitas, negativo para despesas)" },
        date: { type: "string", description: "Data de referência YYYY-MM-DD" },
        isRecurring: { type: "boolean", description: "Se é recorrente/mensal" },
        frequency: { type: "string", enum: ["ONCE", "MONTHLY", "YEARLY"], default: "ONCE", description: "Frequência de recorrência" },
        categoryId: { type: "string", description: "ID da categoria associada" },
      },
      required: ["title", "amount", "date"],
    },
  },
  {
    name: "delete_scenario",
    description: "Exclui um cenário de planejamento",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID do cenário" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_lend",
    description: "Cria um empréstimo (valores devidos a ou por amigos)",
    inputSchema: {
      type: "object",
      properties: {
        friendName: { type: "string", description: "Nome do amigo" },
        friendPhone: { type: "string", description: "Telefone do amigo (opcional)" },
        amount: { type: "number", description: "Valor" },
        dueDate: { type: "string", description: "Data de vencimento YYYY-MM-DD" },
        description: { type: "string", description: "Observações/descrição" },
        categoryId: { type: "string", description: "ID da categoria" },
        domainBillId: { type: "string", description: "ID da fatura associada" },
        domainTransactionId: { type: "string", description: "ID da transação de origem (saída)" },
      },
      required: ["friendName", "amount", "dueDate"],
    },
  },
  {
    name: "update_lend",
    description: "Atualiza um registro de empréstimo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID do empréstimo" },
        status: { type: "string", enum: ["PENDING", "PAID"], description: "Status de quitação" },
        amount: { type: "number", description: "Novo valor" },
        dueDate: { type: "string", description: "Nova data de vencimento YYYY-MM-DD" },
        friendName: { type: "string", description: "Novo nome do amigo" },
        friendPhone: { type: "string", description: "Novo telefone" },
        description: { type: "string", description: "Nova descrição" },
        categoryId: { type: "string", description: "Novo ID da categoria" },
        domainBillId: { type: "string", description: "Novo ID da fatura" },
        domainTransactionId: { type: "string", description: "Novo ID da transação de origem" },
        inflowTransactionId: { type: "string", description: "ID da transação de quitação (entrada)" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_lend",
    description: "Exclui um registro de empréstimo",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID do empréstimo" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_automation_rule",
    description: "Cria uma regra de categorização automática",
    inputSchema: {
      type: "object",
      properties: {
        matchType: { type: "string", enum: ["EXACT", "CONTAINS", "PREFIX", "REGEX"], description: "Tipo de correspondência" },
        matchField: { type: "string", description: "Campo a comparar (geralmente description)" },
        matchValue: { type: "string", description: "Valor esperado" },
        domainCategoryId: { type: "string", description: "ID da categoria a atribuir" },
        priority: { type: "number", default: 100, description: "Prioridade da regra" },
        active: { type: "boolean", default: true, description: "Se a regra está ativa" },
        provider: { type: "string", description: "Filtro por provider específico" },
      },
      required: ["matchType", "matchField", "matchValue", "domainCategoryId"],
    },
  },
  {
    name: "delete_automation_rule",
    description: "Exclui uma regra de categorização automática",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da regra" },
      },
      required: ["id"],
    },
  },
  {
    name: "trigger_sync",
    description: "Dispara sincronização manual (Pluggy, Binance ou Projeção). Com refresh, pede dados frescos à instituição via PATCH /items antes de reler.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["pluggy", "binance", "all"], default: "all", description: "Provedor" },
        force: { type: "boolean", default: false, description: "Forçar liberação de locks existentes" },
        refresh: { type: "boolean", default: true, description: "Disparar PATCH /items para atualizar na instituição (só Pluggy)" },
      },
    },
  },
  {
    name: "refresh_item",
    description: "Dispara PATCH /items/{id} e acompanha o executionStatus até terminar (SUCCESS/PARTIAL_SUCCESS/ERROR). Trata MFA, consentimento, reconexão e rate limit.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "ID do item Pluggy" },
        wait: { type: "boolean", default: true, description: "Aguardar o sync terminar (senão dispara e retorna)" },
      },
      required: ["itemId"],
    },
  },
  {
    name: "get_sync_items",
    description: "Estado de sincronização de cada item Pluggy: status, executionStatus, último sync, erro, consentimento.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "refresh_account_balance",
    description: "Atualiza o saldo de uma conta em tempo real via GET /accounts/{id}/balance, sem sync completo. Faz fallback ao saldo salvo em caso de falha.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "ID da conta de domínio" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "enrich_items",
    description: "Roda o enriquecimento por item da Pluggy: recurring-payments (recorrências) e behavior-analysis (perfil financeiro).",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "ID do item (omitir = todos)" },
      },
    },
  },
  {
    name: "get_card_statements",
    description: "Faturas de cartão por ciclo (motor de billing): fatura atual, próximas, passadas, vencidas e total em aberto, por cartão.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string", description: "ID de um cartão específico (omitir = todos)" },
      },
    },
  },
  {
    name: "get_detected_recurring",
    description: "Recorrências detectadas pela Pluggy (recurring-payments), separadas em receitas e despesas, com regularityScore e ocorrências.",
    inputSchema: {
      type: "object",
      properties: {
        includeHidden: { type: "boolean", default: false, description: "Incluir as ocultadas pelo usuário" },
      },
    },
  },
  {
    name: "set_detected_recurring_status",
    description: "Confirma, oculta ou reabre uma recorrência detectada pela Pluggy.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID da recorrência detectada" },
        userStatus: { type: "string", enum: ["SUGGESTED", "CONFIRMED", "HIDDEN"], description: "Nova decisão manual" },
      },
      required: ["id", "userStatus"],
    },
  },
  {
    name: "get_reports",
    description: "Relatórios consolidados de 12 meses: receitas vs despesas, saúde financeira, gastos por conta, faturas por mês, maiores gastos, variação por categoria e recorrências.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_people",
    description: "Pessoas cadastradas com métricas de valores a receber (empréstimos + divisões de conta).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_settings",
    description: "Atualiza parâmetros de configurações do usuário",
    inputSchema: {
      type: "object",
      properties: {
        monthlySalary: { type: "number", description: "Salário base do usuário" },
        showFutureSalary: { type: "boolean", description: "Exibir salário futuro projetado" },
        showFutureAccounts: { type: "boolean", description: "Exibir contas futuras projetadas" },
        syncIntervalHours: { type: "number", description: "Intervalo de auto-sync em horas" },
        syncLookbackDays: { type: "number", description: "Dias de lookback do sync" },
        salaryPatterns: { type: "array", items: { type: "string" }, description: "Padrões textuais de identificação de salário" },
      },
    },
  },
  {
    name: "simulate_purchase_impact",
    description: "Simula o impacto de uma compra no fluxo de caixa projetado sem salvar nada no banco. Retorna o baseline e a projeção modificada com os deltas de saldo.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Valor da compra em BRL (positivo)" },
        target_month: { type: "string", description: "Mês alvo no formato YYYY-MM (default: mês atual)" },
        description: { type: "string", description: "Descrição opcional da compra" },
      },
      required: ["amount"],
    },
  },
  {
    name: "get_goal_history",
    description: "Retorna a série histórica mensal do progresso de uma meta. Disponível apenas para metas com auto-tracking (matchCategorySlug ou matchKeyword configurados).",
    inputSchema: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "ID da meta" },
        months: { type: "number", description: "Janela de meses para lookback (default: 12)", default: 12 },
      },
      required: ["goal_id"],
    },
  },
];


server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const params = new URLSearchParams();
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        if (value !== undefined) params.set(key, String(value));
      }
    }

    let result: unknown;

    switch (name) {
      case "get_financial_snapshot":
        result = await getOverviewMetrics(params);
        break;
      case "get_net_worth_history":
        result = await getNetWorthMetrics(params);
        break;
      case "get_cashflow":
        result = await getCashFlowMetrics(params);
        break;
      case "get_cashflow_comparison":
        result = await getCashFlowComparisonMetrics(params);
        break;
      case "get_spending_by_category":
        result = await getSpendingByCategoryMetrics(params);
        break;
      case "get_spending_by_merchant":
        result = await getSpendingByMerchantMetrics(params);
        break;
      case "get_spending_trends":
        result = await getSpendingTrendsMetrics(params);
        break;
      case "search_transactions":
        result = await getDomainTransactions(params);
        break;
      case "get_accounts": {
        const [accounts, allocation] = await Promise.all([
          getDomainAccounts(new URLSearchParams({ pageSize: "500" })),
          getAccountAllocationMetrics(new URLSearchParams()),
        ]);
        result = { accounts: accounts.results, allocation };
        break;
      }
      case "get_bills": {
        const summary = await getCardStatementsSummaryMetrics();
        result = {
          counts: summary.counts,
          overdueAmount: summary.overdueAmount,
          openAmount: summary.openAmount,
          dueIn7DaysAmount: summary.dueIn7DaysAmount,
          statements: summary.statements,
        };
        break;
      }
      case "get_investments":
        result = await getDomainInvestments(new URLSearchParams({ pageSize: "500" }));
        break;
      case "get_crypto_portfolio": {
        const [summary, assets] = await Promise.all([
          getCryptoPortfolioMetrics(new URLSearchParams({ period: "all" })),
          getCryptoAssetMetrics(new URLSearchParams({ period: "all" })),
        ]);
        result = { summary, assets: assets.allResults };
        break;
      }
      case "get_recurring_expenses":
        result = await getRecurringPayload();
        break;
      case "get_insights": {
        const { getBehavioralNudges } = await import("../lib/domain/ai-engine.js");
        const { checkBenfordsLaw, detectHiddenSubscriptions } = await import("../lib/domain/forensics.js");
        const [nudges, benford, hiddenSubs] = await Promise.all([
          getBehavioralNudges(),
          checkBenfordsLaw(),
          detectHiddenSubscriptions()
        ]);
        result = { nudges, forensics: { benford, hiddenSubs } };
        break;
      }
      case "get_goals":
        result = await getDomainGoals();
        break;
      case "get_scenarios":
        result = await getDomainScenarios();
        break;
      case "analyze_financial_health": {
        const [overview, recurring, insights] = await Promise.all([
          getOverviewMetrics(new URLSearchParams({ period: "mtd" })),
          getRecurringPayload(),
          import("../lib/domain/ai-engine.js").then(m => m.getBehavioralNudges())
        ]);
        
        const periodNet = Number(overview.periodNet);
        const periodInflow = Number(overview.periodInflow);
        const savingsRate = periodInflow > 0 ? (periodNet / periodInflow) * 100 : 0;
        const commitmentIndex = Number(overview.grossAssets) > 0 
          ? (Number(overview.liabilitiesTotal) / Number(overview.grossAssets)) * 100 
          : 0;
        const burnRate = Math.abs(Number(overview.monthlyOutflow));
        const runway = burnRate > 0 ? Number(overview.accountBalance) / burnRate : 0;

        result = {
          metrics: {
            savingsRate,
            commitmentIndex,
            burnRate,
            runwayMonths: runway,
          },
          overview,
          recurring,
          nudges: insights
        };
        break;
      }
      case "compare_periods": {
        const p1 = args?.period1 as string || "mtd";
        const p2 = args?.period2 as string || "lastMonth";
        const [m1, m2, c1, c2] = await Promise.all([
          getOverviewMetrics(new URLSearchParams({ period: p1 })),
          getOverviewMetrics(new URLSearchParams({ period: p2 })),
          getSpendingByCategoryMetrics(new URLSearchParams({ period: p1 })),
          getSpendingByCategoryMetrics(new URLSearchParams({ period: p2 })),
        ]);
        result = {
          period1: { metrics: m1, categories: c1 },
          period2: { metrics: m2, categories: c2 },
        };
        break;
      }
      case "project_future_cashflow": {
        const projection = await getProjectionPayload(
          new URLSearchParams("months=6"),
        );
        const rules = await getRecurringPayload();
        const settings = await getUserSettings();
        const monthlySalary = settings.monthlySalary;
        const recurringSummary = {
          count: rules.length,
          totalMonthlyExpenses: rules.filter(r => r.type === "EXPENSE").reduce((sum, r) => sum + Number(r.amount || 0), 0),
          totalMonthlyIncome: rules.filter(r => r.type === "INCOME").reduce((sum, r) => sum + Number(r.amount || 0), 0),
        };
        result = {
          // Campo legado (mantido para compatibilidade).
          salary: monthlySalary,
          // Composição auditável do salário e da projeção mês a mês.
          salaryBreakdown: projection.summary.salary,
          summary: projection.summary,
          months: projection.months,
          recurring: recurringSummary,
          rules,
        };
        break;
      }
      case "get_financial_inbox": {
        const payload = await getInboxPayload();
        const includeClosed = Boolean(args?.includeClosed);
        result = includeClosed
          ? payload
          : {
              ...payload,
              results: payload.results.filter((item) => item.status === "open"),
            };
        break;
      }
      case "set_financial_inbox_item_status": {
        const id = String(args?.id ?? "");
        const status = String(args?.status ?? "");
        if (!id || !["open", "resolved", "ignored"].includes(status)) {
          throw new Error("id e status valido sao obrigatorios");
        }
        await setInboxItemStatus(id, status as "open" | "resolved" | "ignored");
        result = await getInboxPayload();
        break;
      }
      case "get_monthly_close": {
        const month = typeof args?.month === "string" ? args.month : currentMonthKey();
        result = await getMonthlyClosePayload(month);
        break;
      }
      case "set_monthly_close_step": {
        const month = typeof args?.month === "string" ? args.month : currentMonthKey();
        const stepId = String(args?.stepId ?? "");
        if (!stepId) throw new Error("stepId e obrigatorio");
        await setMonthlyCloseStep(month, stepId, args?.completed !== false);
        result = await getMonthlyClosePayload(month);
        break;
      }
      case "complete_monthly_close": {
        const month = typeof args?.month === "string" ? args.month : currentMonthKey();
        const payload = await getMonthlyClosePayload(month);
        await completeMonthlyClose(month, payload.summary as Record<string, unknown>);
        result = await getMonthlyClosePayload(month);
        break;
      }
      case "create_transaction": {
        const desc = String(args?.description ?? "").trim();
        const amt = Number(args?.amount ?? 0);
        const dir = String(args?.direction ?? "").toUpperCase();
        const occurredAt = args?.occurredAt ? new Date(String(args.occurredAt)) : new Date();
        const domainAccountId = args?.domainAccountId ? String(args.domainAccountId) : null;
        const domainCategoryId = args?.domainCategoryId ? String(args.domainCategoryId) : null;

        if (!desc) throw new Error("Descrição é obrigatória");
        if (isNaN(amt) || amt <= 0) throw new Error("Valor deve ser um número positivo");
        if (dir !== "INFLOW" && dir !== "OUTFLOW") throw new Error("Direção deve ser INFLOW ou OUTFLOW");
        if (isNaN(occurredAt.getTime())) throw new Error("Data inválida");

        result = await prisma.domainTransaction.create({
          data: {
            occurredAt,
            description: desc,
            normalizedDescription: desc.toLowerCase(),
            amount: new Prisma.Decimal(amt),
            currencyCode: "BRL",
            direction: dir as "INFLOW" | "OUTFLOW",
            sourceProvider: "MANUAL",
            sourceExternalId: `manual-${crypto.randomUUID()}`,
            domainAccountId,
            domainCategoryId,
          },
        });
        break;
      }
      case "update_transaction": {
        const transactionId = String(args?.id ?? "");
        if (!transactionId) throw new Error("ID da transação é obrigatório");

        const existing = await prisma.domainTransaction.findUnique({
          where: { id: transactionId },
        });
        if (!existing) throw new Error("Transação não encontrada");

        const allowedFields = [
          "domainCategoryId",
          "domainMerchantId",
          "description",
          "ignored",
          "occurredAt",
          "direction",
        ] as const;
        const updateData: Record<string, unknown> = {};

        for (const field of allowedFields) {
          if (args && field in args && args[field] !== undefined) {
            updateData[field] = args[field];
          }
        }

        if (args?.markInternalTransfer === true) {
          const transferCategory = await prisma.domainCategory.findFirst({
            where: {
              OR: [
                { kind: DomainCategoryKind.TRANSFER },
                { slug: "uncategorized-transfer" },
                { name: { contains: "transfer" } },
              ],
            },
            orderBy: [{ kind: "desc" }, { name: "asc" }],
          });
          updateData.direction = DomainTransactionDirection.TRANSFER;
          if (transferCategory) {
            updateData.domainCategoryId = transferCategory.id;
          }
        }

        if (args?.markAsSalary === true) {
          if (existing.direction !== DomainTransactionDirection.INFLOW) {
            throw new Error("Apenas transações de entrada podem ser marcadas como salário");
          }
          const salaryCategory = await findOrCreateSalaryCategory();
          updateData.direction = DomainTransactionDirection.INFLOW;
          updateData.domainCategoryId = salaryCategory.id;
        }

        if (args?.markAsInvestment === true) {
          const investmentCategory = await findOrCreateInvestmentCategory();
          updateData.direction = DomainTransactionDirection.OUTFLOW;
          updateData.domainCategoryId = investmentCategory.id;
        }

        if (typeof args?.merchantName === "string" && args.merchantName.trim()) {
          const displayName = args.merchantName.trim();
          const normalizedName = normalizedMerchantName(displayName) ?? displayName.toLowerCase();
          const merchant = await prisma.domainMerchant.upsert({
            where: { normalizedName },
            update: { displayName },
            create: { displayName, normalizedName },
          });
          updateData.domainMerchantId = merchant.id;
          updateData.merchantName = displayName;
        }

        const transaction = await prisma.$transaction(async (tx) => {
          const currentMetadata = parseMetadata(existing.metadataJson);
          const overrides = { ...(currentMetadata.overrides ?? {}) } as Record<string, unknown>;

          if ("occurredAt" in updateData) {
            const parsedDate = new Date(String(updateData.occurredAt));
            if (Number.isNaN(parsedDate.getTime())) {
              throw new Error("Data inválida");
            }
            updateData.occurredAt = parsedDate;
            overrides.occurredAt = parsedDate.toISOString();
          }
          if ("description" in updateData) {
            const description = String(updateData.description).trim();
            updateData.description = description;
            updateData.normalizedDescription = normalizeText(description);
            overrides.description = description;
          }
          if ("domainCategoryId" in updateData) {
            overrides.categoryId = updateData.domainCategoryId;
          }
          if ("domainMerchantId" in updateData) {
            overrides.merchantId = updateData.domainMerchantId;
          }
          if ("merchantName" in updateData) {
            overrides.merchantName = updateData.merchantName;
          }
          if ("direction" in updateData) {
            const direction = String(updateData.direction).toUpperCase();
            if (
              direction !== DomainTransactionDirection.INFLOW &&
              direction !== DomainTransactionDirection.OUTFLOW &&
              direction !== DomainTransactionDirection.TRANSFER
            ) {
              throw new Error("Direção inválida");
            }
            updateData.direction = direction;
            overrides.direction = direction;
          }

          if (Object.keys(overrides).length > 0) {
            updateData.metadataJson = JSON.stringify({
              ...currentMetadata,
              overrides,
            });
          }

          const updated = await tx.domainTransaction.update({
            where: { id: transactionId },
            data: updateData,
          });

          if ("domainCategoryId" in updateData && updateData.domainCategoryId) {
            const assignedCategory = await tx.domainCategory.findUnique({
              where: { id: String(updateData.domainCategoryId) },
            });
            if (
              assignedCategory &&
              (assignedCategory.slug === "seed-salary" ||
                assignedCategory.name.toLowerCase() === "salario" ||
                assignedCategory.name.toLowerCase() === "salário")
            ) {
              const userSetting = await tx.userSetting.upsert({
                where: { id: "default" },
                update: {},
                create: { id: "default" },
              });
              let config: Record<string, unknown> = {};
              if (userSetting.dashboardConfigJson) {
                try {
                  config = JSON.parse(userSetting.dashboardConfigJson) as Record<string, unknown>;
                } catch {}
              }
              const patterns = Array.isArray(config.salaryPatterns)
                ? (config.salaryPatterns as string[]).filter(
                    (pattern) => typeof pattern === "string",
                  )
                : [];
              const term = existing.description ? existing.description.trim() : "";
              if (term && !patterns.includes(term)) {
                patterns.push(term);
                config.salaryPatterns = patterns;
                await tx.userSetting.update({
                  where: { id: "default" },
                  data: {
                    dashboardConfigJson: JSON.stringify(config),
                  },
                });
              }
            }
          }

          if ("ignored" in updateData) {
            if (updateData.ignored === true) {
              await tx.ignoredTransaction.upsert({
                where: { domainTransactionId: transactionId },
                create: {
                  domainTransactionId: transactionId,
                  reason: (args as { ignoreReason?: string })?.ignoreReason ?? null,
                },
                update: {
                  reason: (args as { ignoreReason?: string })?.ignoreReason ?? null,
                },
              });
            } else {
              await tx.ignoredTransaction.deleteMany({
                where: { domainTransactionId: transactionId },
              });
            }
          }

          return updated;
        });

        result = transaction;
        break;
      }
      case "delete_transaction": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID da transação é obrigatório");
        const existing = await prisma.domainTransaction.findUnique({
          where: { id },
        });
        if (!existing) throw new Error("Transação não encontrada");
        if (existing.sourceProvider !== "MANUAL") {
          throw new Error("Apenas transações manuais podem ser excluídas");
        }
        await prisma.domainTransaction.delete({ where: { id } });
        result = { success: true };
        break;
      }
      case "update_account": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID da conta é obrigatório");
        const existing = await prisma.domainAccount.findUnique({ where: { id } });
        if (!existing) throw new Error("Conta não encontrada");

        const data: Record<string, unknown> = {};
        if (args?.name !== undefined) {
          data.name = String(args.name);
          data.normalizedName = normalizeText(String(args.name));
        }
        if (args?.nickname !== undefined) {
          data.nickname = String(args.nickname);
        }
        if (args?.balance !== undefined) {
          if (existing.sourceProvider !== "MANUAL") {
            throw new Error("Apenas o saldo de contas manuais pode ser editado");
          }
          data.balance = new Prisma.Decimal(Number(args.balance));
        }

        result = await prisma.domainAccount.update({
          where: { id },
          data,
        });
        break;
      }
      case "pay_bill": {
        const id = String(args?.id ?? "");
        const status = String(args?.status ?? "PAID").toUpperCase();
        if (!id) throw new Error("ID da fatura é obrigatório");
        if (status !== "PAID" && status !== "OPEN" && status !== "OVERDUE") {
          throw new Error("Status inválido");
        }

        result = await prisma.domainBill.update({
          where: { id },
          data: { status: status as "PAID" | "OPEN" | "OVERDUE" },
        });
        break;
      }
      case "create_goal": {
        const name = String(args?.name ?? "").trim();
        const targetAmount = Number(args?.targetAmount ?? 0);
        if (!name) throw new Error("Nome é obrigatório");
        if (isNaN(targetAmount) || targetAmount <= 0) throw new Error("Valor alvo inválido");

        result = await prisma.goal.create({
          data: {
            name,
            targetAmount: new Prisma.Decimal(targetAmount),
            emoji: args?.emoji ? String(args.emoji) : undefined,
            currentAmount: args?.currentAmount !== undefined ? new Prisma.Decimal(Number(args.currentAmount)) : undefined,
            monthlyContribution: args?.monthlyContribution !== undefined ? new Prisma.Decimal(Number(args.monthlyContribution)) : undefined,
            targetDate: args?.targetDate ? new Date(String(args.targetDate)) : null,
            matchCategorySlug: args?.matchCategorySlug ? String(args.matchCategorySlug) : null,
            matchKeyword: args?.matchKeyword ? String(args.matchKeyword) : null,
            matchDateStart: args?.matchDateStart ? new Date(String(args.matchDateStart)) : null,
          },
        });
        break;
      }
      case "update_goal": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID da meta é obrigatório");

        const data: Record<string, unknown> = {};
        if (args?.name !== undefined) data.name = String(args.name);
        if (args?.emoji !== undefined) data.emoji = String(args.emoji);
        if (args?.targetAmount !== undefined) data.targetAmount = new Prisma.Decimal(Number(args.targetAmount));
        if (args?.currentAmount !== undefined) data.currentAmount = new Prisma.Decimal(Number(args.currentAmount));
        if (args?.monthlyContribution !== undefined) data.monthlyContribution = new Prisma.Decimal(Number(args.monthlyContribution));
        if (args?.targetDate !== undefined) data.targetDate = args.targetDate ? new Date(String(args.targetDate)) : null;
        if (args?.active !== undefined) data.active = Boolean(args.active);
        if (args?.matchCategorySlug !== undefined) data.matchCategorySlug = args.matchCategorySlug ? String(args.matchCategorySlug) : null;
        if (args?.matchKeyword !== undefined) data.matchKeyword = args.matchKeyword ? String(args.matchKeyword) : null;
        if (args?.matchDateStart !== undefined) data.matchDateStart = args.matchDateStart ? new Date(String(args.matchDateStart)) : null;

        result = await prisma.goal.update({
          where: { id },
          data,
        });
        break;
      }
      case "create_scenario": {
        const title = String(args?.title ?? "").trim();
        const amount = Number(args?.amount ?? 0);
        const date = args?.date ? new Date(String(args.date)) : null;
        if (!title) throw new Error("Título é obrigatório");
        if (isNaN(amount) || amount === 0) throw new Error("Valor inválido");
        if (!date || isNaN(date.getTime())) throw new Error("Data inválida");

        result = await prisma.domainScenarioEvent.create({
          data: {
            title,
            amount: new Prisma.Decimal(amount),
            date,
            isRecurring: Boolean(args?.isRecurring),
            frequency: String(args?.frequency ?? "ONCE") as "ONCE" | "MONTHLY" | "YEARLY",
            categoryId: args?.categoryId ? String(args.categoryId) : null,
          },
        });
        break;
      }
      case "delete_scenario": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID é obrigatório");
        await prisma.domainScenarioEvent.delete({ where: { id } });
        result = { success: true };
        break;
      }
      case "create_lend": {
        const friendName = String(args?.friendName ?? "").trim();
        const amount = Number(args?.amount ?? 0);
        const dueDate = args?.dueDate ? new Date(String(args.dueDate)) : null;
        if (!friendName) throw new Error("Nome do amigo é obrigatório");
        if (isNaN(amount) || amount <= 0) throw new Error("Valor deve ser maior que zero");
        if (!dueDate || isNaN(dueDate.getTime())) throw new Error("Data de vencimento inválida");

        result = await prisma.domainLend.create({
          data: {
            friendName,
            friendPhone: args?.friendPhone ? String(args.friendPhone) : null,
            amount: new Prisma.Decimal(amount),
            dueDate,
            description: args?.description ? String(args.description) : null,
            categoryId: args?.categoryId ? String(args.categoryId) : null,
            domainBillId: args?.domainBillId ? String(args.domainBillId) : null,
            domainTransactionId: args?.domainTransactionId ? String(args.domainTransactionId) : null,
            status: "PENDING",
          },
        });
        break;
      }
      case "update_lend": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID do empréstimo é obrigatório");

        const data: Record<string, unknown> = {};
        if (args?.status !== undefined) data.status = String(args.status);
        if (args?.amount !== undefined) data.amount = new Prisma.Decimal(Number(args.amount));
        if (args?.dueDate !== undefined) data.dueDate = args.dueDate ? new Date(String(args.dueDate)) : undefined;
        if (args?.friendName !== undefined) data.friendName = String(args.friendName);
        if (args?.friendPhone !== undefined) data.friendPhone = args.friendPhone ? String(args.friendPhone) : null;
        if (args?.description !== undefined) data.description = args.description ? String(args.description) : null;
        if (args?.categoryId !== undefined) data.categoryId = args.categoryId ? String(args.categoryId) : null;
        if (args?.domainBillId !== undefined) data.domainBillId = args.domainBillId ? String(args.domainBillId) : null;
        if (args?.domainTransactionId !== undefined) data.domainTransactionId = args.domainTransactionId ? String(args.domainTransactionId) : null;
        if (args?.inflowTransactionId !== undefined) data.inflowTransactionId = args.inflowTransactionId ? String(args.inflowTransactionId) : null;

        result = await prisma.domainLend.update({
          where: { id },
          data,
        });
        break;
      }
      case "delete_lend": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID é obrigatório");
        await prisma.domainLend.delete({ where: { id } });
        result = { success: true };
        break;
      }
      case "create_automation_rule": {
        const matchType = String(args?.matchType ?? "").toUpperCase();
        const matchField = String(args?.matchField ?? "");
        const matchValue = String(args?.matchValue ?? "");
        const domainCategoryId = String(args?.domainCategoryId ?? "");

        if (!matchType || !matchField || !matchValue || !domainCategoryId) {
          throw new Error("matchType, matchField, matchValue e domainCategoryId são obrigatórios");
        }

        result = await prisma.categoryRule.create({
          data: {
            matchType: matchType as "EXACT" | "CONTAINS" | "PREFIX" | "REGEX",
            matchField,
            matchValue,
            domainCategoryId,
            priority: args?.priority !== undefined ? Number(args.priority) : 100,
            active: args?.active !== false,
            provider: args?.provider ? (String(args.provider).toUpperCase() as SourceProvider) : null,
          },
        });
        break;
      }
      case "delete_automation_rule": {
        const id = String(args?.id ?? "");
        if (!id) throw new Error("ID é obrigatório");
        await prisma.categoryRule.delete({ where: { id } });
        result = { success: true };
        break;
      }
      case "trigger_sync": {
        const provider = String(args?.provider ?? "all");
        const force = Boolean(args?.force);
        const refresh = args?.refresh !== false;

        if (force) {
          await prisma.opsSyncLock.deleteMany();
        }

        if (provider === "all") {
          const { runFullOperationalSync } = await import("../lib/ingestion/provider-sync.js");
          runFullOperationalSync({ pluggy: { refresh } }).catch(err => console.error("[mcp] full sync failed:", err));
        } else if (provider === "pluggy") {
          const { runPluggySync } = await import("../lib/ingestion/provider-sync.js");
          runPluggySync({ scope: "mcp/manual", resource: "full", refresh }).catch(err => console.error("[mcp] pluggy sync failed:", err));
        } else if (provider === "binance") {
          const { runBinanceSync } = await import("../lib/ingestion/provider-sync.js");
          runBinanceSync({ scope: "mcp/manual", resource: "full" }).catch(err => console.error("[mcp] binance sync failed:", err));
        }
        result = { triggered: true, provider, force, refresh };
        break;
      }
      case "refresh_item": {
        const itemId = String(args?.itemId ?? "");
        if (!itemId) throw new Error("itemId é obrigatório");
        const { refreshPluggyItemAndWait } = await import("../lib/pluggy-item-refresh.js");
        if (args?.wait === false) {
          void refreshPluggyItemAndWait(itemId).catch((err) =>
            console.error("[mcp] refresh_item failed:", err),
          );
          result = { itemId, triggered: true };
        } else {
          result = await refreshPluggyItemAndWait(itemId);
        }
        break;
      }
      case "get_sync_items": {
        const items = await prisma.pluggyItem.findMany({ orderBy: { updatedAt: "desc" } });
        result = items.map((item) => ({
          itemId: item.pluggyItemId,
          institution: item.connectorName,
          status: item.status,
          executionStatus: item.executionStatus,
          lastSyncedAt: item.lastSyncedAt,
          lastUpdatedAt: item.lastUpdatedAt,
          consentExpiresAt: item.consentExpiresAt,
          syncError: item.syncError,
        }));
        break;
      }
      case "refresh_account_balance": {
        const accountId = String(args?.accountId ?? "");
        if (!accountId) throw new Error("accountId é obrigatório");
        const { refreshDomainAccountBalance } = await import("../lib/pluggy-balance.js");
        result = await refreshDomainAccountBalance(accountId);
        break;
      }
      case "enrich_items": {
        const itemId = args?.itemId ? String(args.itemId) : undefined;
        const { runItemEnrichment } = await import("../lib/domain/enrichment/pluggy-item.js");
        result = await runItemEnrichment(itemId);
        break;
      }
      case "get_card_statements": {
        const { getCardStatements } = await import("../lib/domain/billing.js");
        const accountId = args?.accountId ? String(args.accountId) : undefined;
        result = await getCardStatements({ accountId });
        break;
      }
      case "get_detected_recurring": {
        const includeHidden = args?.includeHidden === true;
        const rows = await prisma.pluggyRecurringPayment.findMany({
          where: includeHidden ? {} : { userStatus: { not: "HIDDEN" } },
          orderBy: [{ regularityScore: "desc" }, { occurrences: "desc" }],
        });
        const mapped = rows.map((row) => ({
          id: row.id,
          description: row.description,
          averageAmount: Number(row.averageAmount.toString()),
          direction: row.direction,
          occurrences: row.occurrences,
          regularityScore: row.regularityScore ? Number(row.regularityScore.toString()) : null,
          userStatus: row.userStatus,
          firstDate: row.firstDate,
          lastDate: row.lastDate,
        }));
        result = {
          income: mapped.filter((r) => r.direction === "INCOME"),
          expense: mapped.filter((r) => r.direction === "EXPENSE"),
        };
        break;
      }
      case "set_detected_recurring_status": {
        const id = String(args?.id ?? "");
        const userStatus = String(args?.userStatus ?? "");
        if (!id || !["SUGGESTED", "CONFIRMED", "HIDDEN"].includes(userStatus)) {
          throw new Error("id e userStatus (SUGGESTED|CONFIRMED|HIDDEN) são obrigatórios");
        }
        const updated = await prisma.pluggyRecurringPayment.update({
          where: { id },
          data: { userStatus },
        });
        result = { id: updated.id, userStatus: updated.userStatus };
        break;
      }
      case "get_reports": {
        const { getCardStatements } = await import("../lib/domain/billing.js");
        // Reaproveita a mesma lógica da rota de relatórios via fetch interno
        // não é possível no MCP; então montamos um resumo essencial aqui.
        const statements = await getCardStatements({});
        const totalOpen = statements.reduce((sum, card) => sum + card.totalOpen, 0);
        const { getProjectionPayload } = await import("../lib/domain/derived.js");
        const projection = await getProjectionPayload(new URLSearchParams("months=6"));
        result = {
          cardDebtOpen: Math.round(totalOpen * 100) / 100,
          projection: projection.summary,
        };
        break;
      }
      case "get_people": {
        const [people, lends] = await Promise.all([
          prisma.domainPerson.findMany({ orderBy: { name: "asc" } }),
          prisma.domainLend.findMany(),
        ]);
        result = people.map((person) => {
          const personLends = lends.filter((l) => l.personId === person.id);
          const pending = personLends
            .filter((l) => l.status === "PENDING")
            .reduce((sum, l) => sum + Number(l.amount), 0);
          return {
            id: person.id,
            name: person.name,
            phone: person.phone,
            pendingTotal: Math.round(pending * 100) / 100,
            openItems: personLends.filter((l) => l.status === "PENDING").length,
          };
        });
        break;
      }
      case "update_settings": {
        const {
          monthlySalary,
          showFutureSalary,
          showFutureAccounts,
          syncIntervalHours,
          syncLookbackDays,
          salaryPatterns,
        } = args ?? {};

        let updatedConfigJson: string | undefined = undefined;
        if (Array.isArray(salaryPatterns)) {
          const current = await prisma.userSetting.findFirst({
            where: { id: "default" },
          });
          let config: { salaryPatterns?: string[] } = {};
          if (current?.dashboardConfigJson) {
            try {
              config = JSON.parse(current.dashboardConfigJson);
            } catch {}
          }
          config.salaryPatterns = salaryPatterns.map(String);
          updatedConfigJson = JSON.stringify(config);

          const salaryCat = await prisma.domainCategory.findFirst({
            where: {
              OR: [
                { slug: "seed-salary" },
                { name: { contains: "salario" } },
                { name: { contains: "salário" } },
              ],
            },
          });
          if (salaryCat) {
            for (const pattern of salaryPatterns) {
              await prisma.domainTransaction.updateMany({
                where: {
                  direction: "INFLOW",
                  OR: [
                    { description: { contains: String(pattern) } },
                    { merchantName: { contains: String(pattern) } },
                  ],
                },
                data: {
                  domainCategoryId: salaryCat.id,
                },
              });
            }
          }
        }

        result = await prisma.userSetting.update({
          where: { id: "default" },
          data: {
            monthlySalary: monthlySalary !== undefined ? new Prisma.Decimal(Number(monthlySalary)) : undefined,
            showFutureSalary: showFutureSalary !== undefined ? Boolean(showFutureSalary) : undefined,
            showFutureAccounts: showFutureAccounts !== undefined ? Boolean(showFutureAccounts) : undefined,
            syncIntervalHours: syncIntervalHours !== undefined ? Number(syncIntervalHours) : undefined,
            syncLookbackDays: syncLookbackDays !== undefined ? Number(syncLookbackDays) : undefined,
            dashboardConfigJson: updatedConfigJson,
          },
        });
        break;
      }
      case "simulate_purchase_impact": {
        const amount = Number(args?.amount);
        if (!amount || amount <= 0) throw new Error("amount deve ser um número positivo");
        const description = args?.description ? String(args.description) : undefined;
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const targetMonth = args?.target_month ? String(args.target_month) : defaultMonth;
        if (!/^\d{4}-\d{2}$/.test(targetMonth)) throw new Error("target_month deve estar no formato YYYY-MM");

        const projection = await getProjectionPayload();
        if (!projection || !projection.months || projection.months.length === 0) {
          throw new Error("Não foi possível calcular a projeção base");
        }

        const monthIndex = projection.months.findIndex((m: { label: string }) => m.label === targetMonth);
        if (monthIndex === -1) {
          throw new Error(`Mês ${targetMonth} não encontrado na projeção (horizonte: ${projection.months[0].label} a ${projection.months[projection.months.length - 1].label})`);
        }

        const simulatedMonths = projection.months.map((m: { projected: number; balance: number }, i: number) => {
          if (i < monthIndex) return m;
          return {
            ...m,
            projected: i === monthIndex ? m.projected - amount : m.projected,
            balance: m.balance - amount,
          };
        });

        const baselineBalance = projection.months[projection.months.length - 1].balance as number;
        const simulatedBalance = simulatedMonths[simulatedMonths.length - 1].balance as number;
        const firstNegativeBaseline = (projection.months as Array<{ balance: number; label: string }>).find((m) => m.balance < 0)?.label ?? null;
        const firstNegativeSimulated = (simulatedMonths as unknown as Array<{ balance: number; label: string }>).find((m) => m.balance < 0)?.label ?? null;

        result = {
          amount,
          targetMonth,
          description,
          baseline: {
            summary: projection.summary,
            finalBalance: baselineBalance,
            firstNegativeMonth: firstNegativeBaseline,
          },
          simulated: {
            months: simulatedMonths,
            finalBalance: simulatedBalance,
            firstNegativeMonth: firstNegativeSimulated,
          },
          impact: {
            balanceDelta: simulatedBalance - baselineBalance,
            newNegativeMonthIntroduced: firstNegativeSimulated !== null && firstNegativeSimulated !== firstNegativeBaseline,
            targetMonthBalance: simulatedMonths[monthIndex].balance,
          },
        };
        break;
      }
      case "get_goal_history": {
        const goalId = args?.goal_id ? String(args.goal_id) : null;
        if (!goalId) throw new Error("goal_id é obrigatório");
        const months = args?.months ? Math.max(1, Math.min(60, Number(args.months))) : 12;
        result = await getGoalHistory(goalId, months);
        break;
      }
      default:
        throw new Error(`Tool not found: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(serializeDecimal(result), null, 2),
        },
      ],
    };
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

  return server;
}


async function runServer() {
  const portEnv = process.env.MCP_PORT || process.env.PORT;
  const sseMode = process.argv.includes("--sse") || !!portEnv;

  if (sseMode) {
    const port = Number(portEnv || 3001);
    const bindHost = process.env.MCP_BIND_HOST || "0.0.0.0";
    const allowedHosts = parseCsvEnv(process.env.MCP_ALLOWED_HOSTS);
    const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
    const { createMcpExpressApp } = await import("@modelcontextprotocol/sdk/server/express.js");

    const app = createMcpExpressApp({
      host: bindHost,
      ...(allowedHosts.length > 0 ? { allowedHosts } : {}),
    });
    const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();
    type StatusResponse = {
      headersSent: boolean;
      status(code: number): {
        send(body: string): void;
      };
    };
    type TransportRequest = Parameters<InstanceType<typeof SSEServerTransport>["handlePostMessage"]>[0];
    type TransportResponse = Parameters<InstanceType<typeof SSEServerTransport>["handlePostMessage"]>[1];

    app.get("/sse", async (_req: unknown, res: unknown) => {
      const response = res as ConstructorParameters<typeof SSEServerTransport>[1] & StatusResponse;
      console.error(`[mcp] SSE connection request received`);
      try {
        const server = createServer();
        const transport = new SSEServerTransport("/messages", response);
        const sessionId = transport.sessionId;
        transports.set(sessionId, transport);

        transport.onclose = () => {
          console.error(`[mcp] SSE transport closed for session ${sessionId}`);
          transports.delete(sessionId);
        };

        await server.connect(transport);
        console.error(`[mcp] Established SSE stream with session ID: ${sessionId}`);
      } catch (error) {
        console.error("[mcp] Error establishing SSE stream:", error);
        if (!response.headersSent) {
          response.status(500).send("Error establishing SSE stream");
        }
      }
    });

    app.post("/messages", async (req: unknown, res: unknown) => {
      const request = req as TransportRequest & {
        query: { sessionId?: string | string[] };
        body?: unknown;
      };
      const response = res as TransportResponse & StatusResponse;
      const sessionIdValue = request.query.sessionId;
      const sessionId = Array.isArray(sessionIdValue) ? sessionIdValue[0] : sessionIdValue;
      if (!sessionId) {
        response.status(400).send("Missing sessionId parameter");
        return;
      }
      const transport = transports.get(sessionId);
      if (!transport) {
        response.status(404).send("Session not found");
        return;
      }
      try {
        await transport.handlePostMessage(request, response, request.body);
      } catch (error) {
        console.error("[mcp] Error handling message:", error);
        if (!response.headersSent) {
          response.status(500).send("Error handling message");
        }
      }
    });

    app.listen(port, bindHost, () => {
      console.error(`Gravel Finance MCP Server running over SSE HTTP on port ${port}`);
      console.error(`- Bind Host: ${bindHost}`);
      if (allowedHosts.length > 0) {
        console.error(`- Allowed Hosts: ${allowedHosts.join(", ")}`);
      } else {
        console.error("- Allowed Hosts: <SDK validation disabled for non-loopback bind>");
      }
      console.error(`- SSE Connection Endpoint: http://${bindHost}:${port}/sse`);
      console.error(`- Message Post Endpoint: http://${bindHost}:${port}/messages`);
    });
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Gravel Finance MCP Server running on stdio");
  }
}

async function getAccountAllocationMetrics(searchParams: URLSearchParams) {
  const { getAccountAllocationMetrics: getMetrics } = await import("../lib/domain/analytics/overview.js");
  return getMetrics(searchParams);
}

function parseMetadata(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value) as {
      overrides?: Record<string, unknown>;
      [key: string]: unknown;
    };
  } catch {
    return {};
  }
}

function parseCsvEnv(value?: string) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizedMerchantName(name: string) {
  return normalizeText(name)
    ?.replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function findOrCreateSalaryCategory() {
  const existing = await prisma.domainCategory.findFirst({
    where: {
      OR: [
        { slug: "seed-salary" },
        { name: { contains: "salario" } },
        { name: { contains: "salário" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.domainCategory.create({
    data: {
      slug: "seed-salary",
      name: "Salário",
      kind: DomainCategoryKind.INCOME,
      color: "#10b981",
      sourceProvider: SourceProvider.MANUAL,
    },
  });
}

async function findOrCreateInvestmentCategory() {
  const existing = await prisma.domainCategory.findFirst({
    where: {
      OR: [
        { slug: "seed-investments" },
        { name: { contains: "investimento" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.domainCategory.create({
    data: {
      slug: "seed-investments",
      name: "Investimentos",
      kind: DomainCategoryKind.EXPENSE,
      color: "#f59e0b",
      sourceProvider: SourceProvider.MANUAL,
    },
  });
}

runServer().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
