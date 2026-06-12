import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { serializeDecimal } from "../cli/core/serialize.js";
import {
  getOverviewMetrics,
  getNetWorthMetrics,
  getCashFlowMetrics,
  getCashFlowComparisonMetrics,
  getSpendingByCategoryMetrics,
  getSpendingByMerchantMetrics,
  getSpendingTrendsMetrics,
  getBillsSummaryMetrics,
  getCryptoPortfolioMetrics,
  getCryptoAssetMetrics,
} from "../lib/domain/analytics.js";
import {
  getRecurringPayload,
} from "../lib/domain/derived.js";
import {
  getDomainTransactions,
  getDomainAccounts,
  getDomainBills,
  getDomainInvestments,
  getDomainGoals,
  getDomainScenarios,
  getUserSettings,
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
    description: "Busca transações por período, categoria, direção, conta ou texto",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Termo de busca" },
        period: { type: "string" },
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        direction: { type: "string", enum: ["INFLOW", "OUTFLOW"] },
        accountId: { type: "string" },
        categoryId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 50 },
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
        period2: { type: "string", default: "month" },
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
        const month = params.get("month") || new Date().toISOString().slice(0, 7);
        const billParams = new URLSearchParams({ month });
        const [bills, summary] = await Promise.all([
          getDomainBills(billParams),
          getBillsSummaryMetrics(billParams),
        ]);
        result = { bills: bills.results, summary };
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
        const p2 = args?.period2 as string || "month";
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
        const rules = await getRecurringPayload();
        const settings = await getUserSettings();
        const monthlySalary = settings.monthlySalary;
        const recurringSummary = {
          count: rules.length,
          totalMonthlyExpenses: rules.filter(r => r.type === "EXPENSE").reduce((sum, r) => sum + Number(r.amount || 0), 0),
          totalMonthlyIncome: rules.filter(r => r.type === "INCOME").reduce((sum, r) => sum + Number(r.amount || 0), 0),
        };
        result = {
          salary: monthlySalary,
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


async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gravel Finance MCP Server running on stdio");
}

async function getAccountAllocationMetrics(searchParams: URLSearchParams) {
  const { getAccountAllocationMetrics: getMetrics } = await import("../lib/domain/analytics/overview.js");
  return getMetrics(searchParams);
}

runServer().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
