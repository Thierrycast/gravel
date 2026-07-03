import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import {
  buildCardStatements,
  closingDateForReference,
  dueDateForClosing,
  inferDueDayFromBills,
  isCardPaymentTransaction,
  statementPeriod,
} from "./billing";

const decimal = (value: number) => new Prisma.Decimal(value);

function tx(
  iso: string,
  amount: number,
  overrides?: Partial<{ direction: string; description: string | null }>,
) {
  return {
    id: `tx-${iso}-${amount}`,
    occurredAt: new Date(iso),
    amount: decimal(amount),
    direction: overrides?.direction ?? (amount < 0 ? "OUTFLOW" : "INFLOW"),
    description: overrides?.description ?? "compra teste",
  };
}

describe("closingDateForReference", () => {
  it("usa o fechamento do mês corrente quando a referência é antes ou no dia", () => {
    const closing = closingDateForReference(3, new Date("2026-07-02T10:00:00Z"));
    expect(closing.toISOString().slice(0, 10)).toBe("2026-07-03");
  });

  it("avança para o próximo mês quando a referência já passou do fechamento", () => {
    const closing = closingDateForReference(3, new Date("2026-07-04T10:00:00Z"));
    expect(closing.toISOString().slice(0, 10)).toBe("2026-08-03");
  });

  it("clampa o dia em meses curtos", () => {
    const closing = closingDateForReference(31, new Date("2026-02-10T10:00:00Z"));
    expect(closing.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("statementPeriod", () => {
  it("cobre do dia seguinte ao fechamento anterior até o fechamento", () => {
    const closing = new Date("2026-07-03T12:00:00Z");
    const { start, end } = statementPeriod(3, closing);
    expect(start.toISOString().slice(0, 10)).toBe("2026-06-04");
    expect(end.toISOString().slice(0, 10)).toBe("2026-07-03");
  });
});

describe("dueDateForClosing", () => {
  it("vencimento no mês seguinte quando o dia é menor que o fechamento", () => {
    const due = dueDateForClosing(new Date("2026-07-25T12:00:00Z"), 10);
    expect(due.toISOString().slice(0, 10)).toBe("2026-08-10");
  });

  it("vencimento no mesmo mês quando o dia é maior que o fechamento", () => {
    const due = dueDateForClosing(new Date("2026-07-03T12:00:00Z"), 10);
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-10");
  });
});

describe("isCardPaymentTransaction", () => {
  it("reconhece pagamentos de fatura como INFLOW de pagamento", () => {
    expect(
      isCardPaymentTransaction({
        direction: "INFLOW",
        description: "Pagamento recebido",
      }),
    ).toBe(true);
    expect(
      isCardPaymentTransaction({
        direction: "INFLOW",
        description: "pagamento on line",
      }),
    ).toBe(true);
  });

  it("não marca estornos como pagamento", () => {
    expect(
      isCardPaymentTransaction({
        direction: "INFLOW",
        description: 'Crédito de "LOJA X"',
      }),
    ).toBe(false);
  });
});

describe("inferDueDayFromBills", () => {
  it("retorna o dia mais frequente com pelo menos 2 ocorrências", () => {
    expect(
      inferDueDayFromBills([
        { dueDate: new Date("2026-04-10T12:00:00Z") },
        { dueDate: new Date("2026-05-10T12:00:00Z") },
        { dueDate: new Date("2026-06-11T12:00:00Z") },
      ]),
    ).toBe(10);
  });

  it("retorna null com histórico insuficiente", () => {
    expect(
      inferDueDayFromBills([{ dueDate: new Date("2026-06-10T12:00:00Z") }]),
    ).toBeNull();
  });
});

describe("buildCardStatements", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  // Fechamento dia 3, vencimento dia 10.
  const base = { accountId: "card-1", closingDay: 3, dueDay: 10, now };

  it("separa fatura atual de futuras e passadas", () => {
    const { current, upcoming, past } = buildCardStatements({
      ...base,
      transactions: [
        tx("2026-06-20T12:00:00Z", -100), // ciclo que fecha 2026-07-03 (atual)
        tx("2026-07-01T12:00:00Z", -50), // atual
        tx("2026-07-10T12:00:00Z", -40), // fecha 2026-08-03 (futura)
        tx("2026-08-22T12:00:00Z", -30), // fecha 2026-09-03 (futura)
        tx("2026-05-20T12:00:00Z", -80), // fechou 2026-06-03 (passada)
      ],
      providerBills: [],
    });

    expect(current).not.toBeNull();
    expect(current?.amount).toBe(150);
    expect(current?.dueDate.slice(0, 10)).toBe("2026-07-10");
    expect(current?.status).toBe("OPEN");

    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]?.amount).toBe(40);
    expect(upcoming[1]?.amount).toBe(30);

    expect(past).toHaveLength(1);
    expect(past[0]?.amount).toBe(80);
  });

  it("ignora pagamentos de fatura e desconta estornos", () => {
    const { current } = buildCardStatements({
      ...base,
      transactions: [
        tx("2026-06-20T12:00:00Z", -100),
        tx("2026-06-21T12:00:00Z", 500, {
          direction: "INFLOW",
          description: "Pagamento recebido",
        }),
        tx("2026-06-22T12:00:00Z", 20, {
          direction: "INFLOW",
          description: 'Crédito de "LOJA"',
        }),
      ],
      providerBills: [],
    });
    expect(current?.amount).toBe(80);
  });

  it("prefere o valor oficial do provedor em ciclos reconciliados", () => {
    const { past } = buildCardStatements({
      ...base,
      transactions: [tx("2026-05-20T12:00:00Z", -80)],
      providerBills: [
        {
          id: "bill-1",
          dueDate: new Date("2026-06-10T12:00:00Z"),
          totalAmount: decimal(85.5),
          minimumPaymentAmount: decimal(10),
          status: "CLOSED",
          metadataJson: null,
        },
      ],
    });
    expect(past[0]?.amount).toBe(85.5);
    expect(past[0]?.reconciled).toBe(true);
  });

  it("marca ciclo passado sem valor como pago e com valor vencido como OVERDUE", () => {
    const { past } = buildCardStatements({
      ...base,
      transactions: [
        tx("2026-04-20T12:00:00Z", -60), // fechou 2026-05-03, venceu 2026-05-10
      ],
      providerBills: [],
    });
    expect(past[0]?.status).toBe("OVERDUE");
  });

  it("marca como paga quando pagamentos cobrem a fatura", () => {
    const { past } = buildCardStatements({
      ...base,
      transactions: [
        tx("2026-04-20T12:00:00Z", -60), // fecha 2026-05-03, vence 2026-05-10
        tx("2026-05-08T12:00:00Z", 60, {
          direction: "INFLOW",
          description: "Pagamento recebido",
        }),
      ],
      providerBills: [],
    });
    expect(past[0]?.status).toBe("PAID");
  });

  it("assume quitada fatura antiga sem evidência de dívida", () => {
    const { past } = buildCardStatements({
      ...base,
      transactions: [
        tx("2025-10-20T12:00:00Z", -60), // venceu 2025-11-10, há ~8 meses
      ],
      providerBills: [],
    });
    expect(past[0]?.status).toBe("PAID");
  });

  it("cria a fatura atual mesmo sem compras no ciclo", () => {
    const { current } = buildCardStatements({
      ...base,
      transactions: [],
      providerBills: [],
    });
    expect(current).not.toBeNull();
    expect(current?.amount).toBe(0);
  });
});
