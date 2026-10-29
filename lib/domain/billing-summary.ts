import type { CardStatement, CardStatementsPayload } from "@/lib/domain/billing";

/**
 * Resumo único das faturas por ciclo. A tela /bills, o CLI, o MCP, o chat e o
 * briefing liam o mesmo motor mas somavam cada um do seu jeito — e divergiam:
 * a fatura FECHADA (ciclo encerrado, ainda não vencida) contava como paga no
 * CLI/MCP e sumia dos totais da tela, justo a que mais importa pagar.
 *
 * Sem dependência de banco: roda no cliente e no servidor.
 */
export type CardStatementsSummary = {
  counts: {
    overdue: number;
    /** Ciclo corrente, ainda acumulando compras. */
    open: number;
    /** Ciclo fechado, aguardando o vencimento: é a próxima a pagar. */
    closed: number;
    paid: number;
    future: number;
    /** Fechadas, abertas ou futuras que vencem nos próximos 7 dias. */
    dueIn7Days: number;
  };
  /** Vencidas e não pagas. */
  overdueAmount: number;
  /** Ciclos correntes (fatura ainda aberta). */
  openAmount: number;
  /** Ciclos fechados aguardando vencimento. */
  closedAmount: number;
  /** Parcelas já lançadas em ciclos futuros. */
  upcomingAmount: number;
  dueIn7DaysAmount: number;
  /** Saldo devedor total informado pelo banco — o "Total em aberto" da tela. */
  totalOpen: number;
  nearestDue: { accountId: string; accountName: string; statement: CardStatement } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeCardStatements(
  cards: CardStatementsPayload[],
  now: Date = new Date(),
): CardStatementsSummary {
  const in7Days = now.getTime() + 7 * DAY_MS;
  const summary: CardStatementsSummary = {
    counts: { overdue: 0, open: 0, closed: 0, paid: 0, future: 0, dueIn7Days: 0 },
    overdueAmount: 0,
    openAmount: 0,
    closedAmount: 0,
    upcomingAmount: 0,
    dueIn7DaysAmount: 0,
    totalOpen: 0,
    nearestDue: null,
  };

  for (const card of cards) {
    summary.totalOpen += card.totalOpen;
    const statements = [
      ...(card.current ? [card.current] : []),
      ...card.upcoming,
      ...card.past,
    ];

    for (const statement of statements) {
      const due = new Date(statement.dueDate).getTime();
      const payable =
        statement.status === "OPEN" ||
        statement.status === "CLOSED" ||
        statement.status === "FUTURE";

      switch (statement.status) {
        case "OVERDUE":
          summary.counts.overdue += 1;
          summary.overdueAmount += statement.amount;
          break;
        case "OPEN":
          summary.counts.open += 1;
          summary.openAmount += statement.amount;
          break;
        case "CLOSED":
          summary.counts.closed += 1;
          summary.closedAmount += statement.amount;
          break;
        case "FUTURE":
          summary.counts.future += 1;
          summary.upcomingAmount += statement.amount;
          break;
        case "PAID":
          summary.counts.paid += 1;
          break;
      }

      if (!payable || statement.amount <= 0) continue;
      if (due >= now.getTime() - DAY_MS && due <= in7Days) {
        summary.counts.dueIn7Days += 1;
        summary.dueIn7DaysAmount += statement.amount;
      }
      const nearest = summary.nearestDue;
      if (!nearest || due < new Date(nearest.statement.dueDate).getTime()) {
        summary.nearestDue = {
          accountId: card.accountId,
          accountName: card.accountName,
          statement,
        };
      }
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  summary.overdueAmount = round(summary.overdueAmount);
  summary.openAmount = round(summary.openAmount);
  summary.closedAmount = round(summary.closedAmount);
  summary.upcomingAmount = round(summary.upcomingAmount);
  summary.dueIn7DaysAmount = round(summary.dueIn7DaysAmount);
  summary.totalOpen = round(summary.totalOpen);
  return summary;
}
