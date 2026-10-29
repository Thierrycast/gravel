import { describe, expect, it } from "vitest";

import type { CardStatement, CardStatementsPayload } from "@/lib/domain/billing";
import { summarizeCardStatements } from "@/lib/domain/billing-summary";

const NOW = new Date("2026-10-28T12:00:00Z");

function statement(
  status: CardStatement["status"],
  amount: number,
  dueDate: string,
): CardStatement {
  return {
    id: `card:${dueDate}`,
    accountId: "card",
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T00:00:00Z",
    dueDate,
    amount,
    providerAmount: null,
    minimumPayment: null,
    status,
    transactionCount: 1,
    reconciled: false,
    paidAt: null,
    providerBillId: null,
  };
}

function card(overrides: Partial<CardStatementsPayload>): CardStatementsPayload {
  return {
    accountId: "card",
    accountName: "Cartão",
    institutionName: null,
    imageUrl: null,
    configured: true,
    closingDay: 25,
    dueDay: 2,
    suggestedDueDay: null,
    totalOpen: 0,
    current: null,
    upcoming: [],
    past: [],
    ...overrides,
  };
}

describe("summarizeCardStatements", () => {
  it("fatura fechada não vencida é a pagar, não paga", () => {
    const summary = summarizeCardStatements(
      [
        card({
          totalOpen: 1500,
          current: statement("OPEN", 300, "2026-12-02T00:00:00Z"),
          past: [
            statement("CLOSED", 1200, "2026-11-02T00:00:00Z"),
            statement("PAID", 900, "2026-10-02T00:00:00Z"),
          ],
        }),
      ],
      NOW,
    );

    expect(summary.counts).toMatchObject({ closed: 1, paid: 1, open: 1, dueIn7Days: 1 });
    expect(summary.closedAmount).toBe(1200);
    expect(summary.dueIn7DaysAmount).toBe(1200);
    expect(summary.totalOpen).toBe(1500);
    expect(summary.nearestDue?.statement.status).toBe("CLOSED");
  });

  it("vencida conta como atraso e fica fora do próximo vencimento", () => {
    const summary = summarizeCardStatements(
      [
        card({
          past: [statement("OVERDUE", 400, "2026-10-02T00:00:00Z")],
          upcoming: [statement("FUTURE", 150, "2027-01-02T00:00:00Z")],
        }),
      ],
      NOW,
    );

    expect(summary.overdueAmount).toBe(400);
    expect(summary.upcomingAmount).toBe(150);
    expect(summary.nearestDue?.statement.status).toBe("FUTURE");
  });
});
