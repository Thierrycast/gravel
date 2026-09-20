import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { summarizeBills, type SummarizableBill } from "./bills-summary";

// Horário LOCAL de propósito: startOfLocalDay usa setHours, e meia-noite UTC
// num fuso a oeste cai no dia anterior — foi o que quebrou a primeira versão
// destes testes, e é a mesma classe de erro que a auditoria apontou nos
// recortes de período.
const NOW = new Date(2026, 8, 20, 14, 30); // 20/09/2026, 14:30 local
const RATE = 5;

function fatura(overrides: Partial<SummarizableBill> & { id: string }): SummarizableBill {
  return {
    status: "OPEN",
    dueDate: new Date(2026, 8, 25),
    totalAmount: new Prisma.Decimal(100),
    minimumPaymentAmount: null,
    currencyCode: "BRL",
    ...overrides,
  } as SummarizableBill;
}

/** Meia-noite local do dia indicado. */
const dia = (mes: number, dia: number) => new Date(2026, mes - 1, dia);

describe("summarizeBills — conta vencendo hoje", () => {
  it("inclui a fatura que vence hoje no total de 7 dias", () => {
    // O bug: `bill.dueDate >= now` com now = 14:30 de hoje. A fatura de hoje
    // tem carimbo 00:00, então ficava para trás da comparação e sumia do
    // total — exatamente a que a pessoa mais precisa ver.
    const resumo = summarizeBills(
      [fatura({ id: "hoje", dueDate: dia(9, 20) })],
      NOW,
      RATE,
      12,
    );

    expect(resumo.dueIn7DaysAmount.toString()).toBe("100");
    expect(resumo.dueIn30DaysAmount.toString()).toBe("100");
  });

  it("inclui a fatura de hoje também na lista de próximas", () => {
    const resumo = summarizeBills(
      [fatura({ id: "hoje", dueDate: dia(9, 20) })],
      NOW,
      RATE,
      12,
    );
    expect(resumo.upcoming.map((bill) => bill.id)).toEqual(["hoje"]);
  });

  it("não puxa fatura de ontem", () => {
    const resumo = summarizeBills(
      [fatura({ id: "ontem", dueDate: dia(9, 19) })],
      NOW,
      RATE,
      12,
    );
    expect(resumo.dueIn7DaysAmount.toString()).toBe("0");
  });

  it("respeita a borda dos 7 e dos 30 dias", () => {
    const resumo = summarizeBills(
      [
        fatura({ id: "d7", dueDate: dia(9, 27) }),
        fatura({ id: "d8", dueDate: dia(9, 28) }),
        fatura({ id: "d30", dueDate: dia(10, 20) }),
        fatura({ id: "d31", dueDate: dia(10, 21) }),
      ],
      NOW,
      RATE,
      12,
    );

    expect(resumo.dueIn7DaysAmount.toString()).toBe("100");
    expect(resumo.dueIn30DaysAmount.toString()).toBe("300");
  });
});

describe("summarizeBills — câmbio", () => {
  it("converte fatura em dólar antes de somar", () => {
    // getBillsSummaryMetrics somava totalAmount cru, então uma fatura de
    // US$ 100 entrava no mesmo balde que R$ 100.
    const resumo = summarizeBills(
      [
        fatura({ id: "brl", totalAmount: new Prisma.Decimal(100) }),
        fatura({ id: "usd", totalAmount: new Prisma.Decimal(100), currencyCode: "USD" }),
      ],
      NOW,
      RATE,
      12,
    );

    expect(resumo.totalAmount.toString()).toBe("600");
  });

  it("converte stablecoin como dólar", () => {
    const resumo = summarizeBills(
      [fatura({ id: "usdt", totalAmount: new Prisma.Decimal(10), currencyCode: "USDT" })],
      NOW,
      RATE,
      12,
    );
    expect(resumo.totalAmount.toString()).toBe("50");
  });

  it("declara moeda que não soube converter", () => {
    const resumo = summarizeBills(
      [fatura({ id: "eur", currencyCode: "EUR" })],
      NOW,
      RATE,
      12,
    );
    expect(resumo.unsupportedCurrencies).toEqual(["EUR"]);
  });

  it("converte também os recortes por status", () => {
    const resumo = summarizeBills(
      [
        fatura({ id: "aberta", status: "OPEN", totalAmount: new Prisma.Decimal(10), currencyCode: "USD" }),
        fatura({ id: "vencida", status: "OVERDUE", totalAmount: new Prisma.Decimal(20), currencyCode: "USD", dueDate: dia(9, 1) }),
        fatura({ id: "paga", status: "PAID", totalAmount: new Prisma.Decimal(30), currencyCode: "USD" }),
      ],
      NOW,
      RATE,
      12,
    );

    expect(resumo.openAmount.toString()).toBe("50");
    expect(resumo.overdueAmount.toString()).toBe("100");
    expect(resumo.paidAmount.toString()).toBe("150");
  });
});

describe("summarizeBills — contagens e limite", () => {
  it("conta por status", () => {
    const resumo = summarizeBills(
      [
        fatura({ id: "a", status: "OPEN" }),
        fatura({ id: "b", status: "OVERDUE", dueDate: dia(9, 1) }),
        fatura({ id: "c", status: "PAID" }),
        // CLOSED com vencimento futuro vira OPEN de propósito (ciclo fechado
        // mas não pago). Para continuar CLOSED, o vencimento tem que ter
        // passado — ver normalizeBillStatus.
        fatura({ id: "d", status: "CLOSED", dueDate: dia(9, 1) }),
      ],
      NOW,
      RATE,
      12,
    );

    expect(resumo.counts).toEqual({ bills: 4, open: 1, overdue: 1, paid: 2 });
  });

  it("limita a lista de próximas sem mexer nos totais", () => {
    const faturas = Array.from({ length: 5 }, (_, i) =>
      fatura({ id: `f${i}`, dueDate: dia(9, 25) }),
    );
    const resumo = summarizeBills(faturas, NOW, RATE, 2);

    expect(resumo.upcoming).toHaveLength(2);
    expect(resumo.totalAmount.toString()).toBe("500");
  });

  it("aguenta lista vazia", () => {
    const resumo = summarizeBills([], NOW, RATE, 12);
    expect(resumo.totalAmount.toString()).toBe("0");
    expect(resumo.counts.bills).toBe(0);
    expect(resumo.upcoming).toEqual([]);
  });

  it("ignora fatura sem data de vencimento nos recortes por prazo", () => {
    const resumo = summarizeBills(
      [fatura({ id: "sem-data", dueDate: null })],
      NOW,
      RATE,
      12,
    );
    expect(resumo.dueIn7DaysAmount.toString()).toBe("0");
    expect(resumo.totalAmount.toString()).toBe("100");
  });
});
