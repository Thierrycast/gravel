import { jsonError, jsonOk } from "@/lib/core/http";
import { classifyCashFlowTransaction } from "@/lib/domain/analytics";
import { getCardStatements } from "@/lib/domain/billing";
import { getRecurringPayload } from "@/lib/domain/derived";
import { getUserSettings } from "@/lib/domain/queries";
import { monthlyEquivalentAmount } from "@/lib/domain/recurring";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MONTHS_WINDOW = 12;

function monthKeyOf(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Relatórios consolidados: uma passada sobre as transações dos últimos 12
 * meses alimenta vários relatórios pequenos, garantindo que todos usem a
 * mesma classificação de fluxo (receita/despesa/transferência) do resto do
 * app.
 */
export async function GET() {
  try {
    const now = new Date();
    const windowStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_WINDOW - 1), 1),
    );

    const [
      transactions,
      categories,
      accounts,
      cardStatements,
      recurringRules,
      settings,
    ] = await Promise.all([
      prisma.domainTransaction.findMany({
        where: {
          ignored: false,
          occurredAt: { gte: windowStart, lte: now },
        },
        select: {
          occurredAt: true,
          amount: true,
          direction: true,
          description: true,
          merchantName: true,
          domainCategoryId: true,
          domainAccountId: true,
          installmentTotal: true,
        },
      }),
      prisma.domainCategory.findMany(),
      prisma.domainAccount.findMany(),
      getCardStatements({ now }),
      getRecurringPayload(),
      getUserSettings(),
    ]);

    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    // ── Receitas vs despesas por mês ────────────────────────────────────────
    const monthlyFlow = new Map<
      string,
      { income: number; expenses: number }
    >();
    // ── Gastos por conta ────────────────────────────────────────────────────
    const spendingByAccount = new Map<string, number>();
    // ── Maiores gastos do período (90 dias) ─────────────────────────────────
    const recentCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const topExpenses: Array<{
      description: string;
      amount: number;
      date: string;
      account: string | null;
      category: string | null;
    }> = [];
    // ── Variação por categoria: mês atual vs anterior ───────────────────────
    const currentMonthKey = monthKeyOf(now);
    const previousMonthKey = monthKeyOf(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    );
    const categoryMonthTotals = new Map<
      string,
      { current: number; previous: number }
    >();

    for (const tx of transactions) {
      const category = tx.domainCategoryId
        ? categoryById.get(tx.domainCategoryId)
        : null;
      const classification = classifyCashFlowTransaction(
        tx.direction,
        category?.name,
        category?.kind,
        tx.description,
        {
          salaryPatterns: settings.salaryPatterns,
          merchantName: tx.merchantName,
        },
      );
      if (classification !== "income" && classification !== "expense") continue;
      if (tx.occurredAt > now) continue;

      const amount = Math.abs(Number(tx.amount));
      const key = monthKeyOf(tx.occurredAt);
      const flow = monthlyFlow.get(key) ?? { income: 0, expenses: 0 };
      if (classification === "income") flow.income += amount;
      else flow.expenses += amount;
      monthlyFlow.set(key, flow);

      if (classification === "expense") {
        if (tx.domainAccountId) {
          spendingByAccount.set(
            tx.domainAccountId,
            (spendingByAccount.get(tx.domainAccountId) ?? 0) + amount,
          );
        }
        if (tx.occurredAt >= recentCutoff && !tx.installmentTotal) {
          topExpenses.push({
            description:
              tx.merchantName ?? tx.description ?? "Sem descrição",
            amount,
            date: tx.occurredAt.toISOString(),
            account: tx.domainAccountId
              ? (accountById.get(tx.domainAccountId)?.nickname ??
                accountById.get(tx.domainAccountId)?.name ??
                null)
              : null,
            category: category?.name ?? null,
          });
        }
        if (key === currentMonthKey || key === previousMonthKey) {
          const catName = category?.name ?? "Sem categoria";
          const totals = categoryMonthTotals.get(catName) ?? {
            current: 0,
            previous: 0,
          };
          if (key === currentMonthKey) totals.current += amount;
          else totals.previous += amount;
          categoryMonthTotals.set(catName, totals);
        }
      }
    }

    const monthlyFlowSeries = [...monthlyFlow.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, flow]) => ({
        month,
        income: round2(flow.income),
        expenses: round2(flow.expenses),
        net: round2(flow.income - flow.expenses),
      }));

    const spendingByAccountList = [...spendingByAccount.entries()]
      .map(([accountId, total]) => {
        const account = accountById.get(accountId);
        return {
          accountId,
          name: account?.nickname ?? account?.name ?? "Conta",
          kind: account?.kind ?? "OTHER",
          total: round2(total),
        };
      })
      .sort((a, b) => b.total - a.total);

    topExpenses.sort((a, b) => b.amount - a.amount);

    const categoryDeltas = [...categoryMonthTotals.entries()]
      .map(([name, totals]) => ({
        category: name,
        current: round2(totals.current),
        previous: round2(totals.previous),
        delta: round2(totals.current - totals.previous),
      }))
      .filter((item) => Math.abs(item.delta) >= 1)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // ── Faturas por mês (motor de billing) ──────────────────────────────────
    const billsByMonth = new Map<string, number>();
    for (const card of cardStatements) {
      if (!card.configured) continue;
      const all = [
        ...card.past,
        ...(card.current ? [card.current] : []),
        ...card.upcoming,
      ];
      for (const statement of all) {
        const key = statement.dueDate.slice(0, 7);
        billsByMonth.set(key, (billsByMonth.get(key) ?? 0) + statement.amount);
      }
    }
    const billsByMonthSeries = [...billsByMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total: round2(total) }))
      .filter((item) => item.month >= monthKeyOf(windowStart));

    // ── Recorrências (equivalente mensal) ───────────────────────────────────
    const activeRules = recurringRules.filter(
      (rule) => rule.active && !rule.isInstallment,
    );
    const recurringSummary = {
      monthlyIncome: round2(
        activeRules
          .filter((rule) => rule.type === "INCOME")
          .reduce(
            (sum, rule) =>
              sum +
              monthlyEquivalentAmount(
                Math.abs(Number(rule.amount)),
                rule.interval,
              ),
            0,
          ),
      ),
      monthlyExpenses: round2(
        activeRules
          .filter((rule) => rule.type === "EXPENSE")
          .reduce(
            (sum, rule) =>
              sum +
              monthlyEquivalentAmount(
                Math.abs(Number(rule.amount)),
                rule.interval,
              ),
            0,
          ),
      ),
      incomeRules: activeRules.filter((rule) => rule.type === "INCOME").length,
      expenseRules: activeRules.filter((rule) => rule.type === "EXPENSE")
        .length,
    };

    // ── Saúde financeira ────────────────────────────────────────────────────
    // Médias dos últimos 3 meses fechados (exclui o mês corrente parcial).
    const closedMonths = monthlyFlowSeries.filter(
      (item) => item.month !== currentMonthKey,
    );
    const last3 = closedMonths.slice(-3);
    const avgIncome =
      last3.reduce((sum, item) => sum + item.income, 0) /
      Math.max(last3.length, 1);
    const avgExpenses =
      last3.reduce((sum, item) => sum + item.expenses, 0) /
      Math.max(last3.length, 1);
    const savingsRate =
      avgIncome > 0 ? Math.max((avgIncome - avgExpenses) / avgIncome, -1) : 0;
    const totalCardOpen = cardStatements.reduce(
      (sum, card) => sum + card.totalOpen,
      0,
    );
    const cardDebtRatio = avgIncome > 0 ? totalCardOpen / avgIncome : 0;
    const recurringCoverage =
      recurringSummary.monthlyIncome > 0
        ? recurringSummary.monthlyExpenses / recurringSummary.monthlyIncome
        : null;

    // Score 0-100: taxa de poupança pesa 60, dívida de cartão 40.
    const savingsScore = Math.max(Math.min(savingsRate / 0.3, 1), 0) * 60;
    const debtScore = Math.max(1 - Math.min(cardDebtRatio / 2, 1), 0) * 40;
    const healthScore = Math.round(savingsScore + debtScore);

    return jsonOk({
      results: {
        monthlyFlow: monthlyFlowSeries,
        spendingByAccount: spendingByAccountList,
        topExpenses: topExpenses.slice(0, 10),
        categoryDeltas: categoryDeltas.slice(0, 8),
        billsByMonth: billsByMonthSeries,
        recurringSummary,
        health: {
          score: healthScore,
          savingsRate: round2(savingsRate * 100),
          avgMonthlyIncome: round2(avgIncome),
          avgMonthlyExpenses: round2(avgExpenses),
          cardDebt: round2(totalCardOpen),
          cardDebtToIncome: round2(cardDebtRatio * 100),
          recurringCoverage:
            recurringCoverage !== null ? round2(recurringCoverage * 100) : null,
        },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
