import { DomainTransactionDirection, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  classifyCashFlowTransaction,
  detectInternalTransferPairIds,
  extractTransferCounterparty,
  isActiveInvestmentPosition,
  isOutstandingBill,
  normalizeBillStatus,
} from "./shared";

function tx(overrides: {
  id: string;
  direction: DomainTransactionDirection;
  amount: number;
  occurredAt: string;
  description?: string | null;
  merchantName?: string | null;
}) {
  return {
    id: overrides.id,
    direction: overrides.direction,
    amount: new Prisma.Decimal(overrides.amount),
    occurredAt: new Date(overrides.occurredAt),
    description: overrides.description ?? null,
    normalizedDescription: null,
    merchantName: overrides.merchantName ?? null,
  };
}

describe("classifyCashFlowTransaction", () => {
  it("counts an external received transfer as income", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Transferencias",
        "TRANSFER",
        "Pix recebido Guilherme Nathan Pinheiro Santos",
      ),
    ).toBe("income");
  });

  it("excludes transfers between the user's own accounts from income", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Transferencia mesma titularidade - PIX",
        "TRANSFER",
        "Deposito de dinheiro",
      ),
    ).toBe("excluded");
  });

  it("treats a salary-pattern inflow as income even when categorized as own-account transfer", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Transferencia mesma titularidade - PIX",
        "TRANSFER",
        "Transferência Recebida|THIERRY BARRETO DE CASTRO",
        {
          salaryPatterns: ["transferencia recebida|thierry barreto de castro"],
        },
      ),
    ).toBe("income");
  });

  it("never turns card bill payments into income, even with a matching salary pattern", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Pagamento de cartao de credito",
        "EXPENSE",
        "Pagamento recebido",
        {
          salaryPatterns: ["pagamento recebido"],
        },
      ),
    ).toBe("excluded");
  });

  it("does not let salary patterns affect outflows", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Transferencia mesma titularidade - PIX",
        "TRANSFER",
        "Transferência Enviada|THIERRY BARRETO DE CASTRO",
        {
          salaryPatterns: ["thierry barreto de castro"],
        },
      ),
    ).toBe("excluded");
  });

  it("excludes credit card settlements that arrive as inflows", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Pagamento de cartao de credito",
        "EXPENSE",
        "Pagamento recebido",
      ),
    ).toBe("excluded");
  });

  it("keeps investment contributions out of operating expenses", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Investimentos",
        "EXPENSE",
        "Aplicacao CDB",
      ),
    ).toBe("investment");
  });

  it("treats 'Pagamento recebido' as excluded from income (FICHA 1)", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Outros",
        "INCOME",
        "Pagamento recebido",
      ),
    ).toBe("excluded");
  });

  it("treats 'Valor adicionado na conta por cartão de crédito' as excluded from income (FICHA 2)", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Outros",
        "INCOME",
        "Valor adicionado na conta por cartao de credito",
      ),
    ).toBe("excluded");
  });

  it("treats 'Depósito de dinheiro' as income when it is bank-recorded new money for this user (FICHA 3)", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Outros",
        "INCOME",
        "Depósito de dinheiro",
      ),
    ).toBe("income");
  });

  it("treats a third-party transfer as an expense, even if categoryKind is TRANSFER (FICHA 4)", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Pix Enviado",
        "TRANSFER",
        "Pix enviado - Pamella",
      ),
    ).toBe("expense");
  });

  it("excludes the outflow leg of a card bill payment (purchases already count)", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Transferências",
        "TRANSFER",
        "Pagamento de fatura",
      ),
    ).toBe("excluded");
  });

  it("excludes 'Pagamento efetuado - Pagamento Fatura' outflows regardless of category", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Outros",
        "EXPENSE",
        "Pagamento efetuado - Pagamento Fatura - THIERRY BARRETO DE CASTRO",
      ),
    ).toBe("excluded");
  });

  it("keeps a regular boleto payment as an expense", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.OUTFLOW,
        "Contas",
        "EXPENSE",
        "Pagamento efetuado - Boleto Energia",
      ),
    ).toBe("expense");
  });
});

describe("extractTransferCounterparty", () => {
  it("extracts the name after a pipe separator", () => {
    expect(
      extractTransferCounterparty(
        "Transferência Recebida|THIERRY BARRETO DE CASTRO",
      ),
    ).toBe("thierry barreto de castro");
  });

  it("extracts the name after a dash separator", () => {
    expect(
      extractTransferCounterparty("Pix enviado - Thierry Barreto De Castro"),
    ).toBe("thierry barreto de castro");
  });

  it("strips document numbers embedded in the counterparty", () => {
    expect(
      extractTransferCounterparty(
        "Transferência Recebida|67.037.195 THIERRY BARRETO DE CASTRO",
      ),
    ).toBe("thierry barreto de castro");
  });

  it("returns null for non-transfer descriptions", () => {
    expect(extractTransferCounterparty("Depósito de dinheiro")).toBeNull();
    expect(extractTransferCounterparty("Netflix assinatura")).toBeNull();
  });
});

describe("detectInternalTransferPairIds", () => {
  it("pairs an outflow and inflow of the same value and counterparty", () => {
    const paired = detectInternalTransferPairIds([
      tx({
        id: "out",
        direction: DomainTransactionDirection.OUTFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:11Z",
        description: "Pix enviado - Thierry Barreto De Castro",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:12Z",
        description: "Transferência Recebida|THIERRY BARRETO DE CASTRO",
      }),
    ]);
    expect(paired.has("out")).toBe(true);
    expect(paired.has("in")).toBe(true);
  });

  it("does not pair the real salary inflow with the self-transfer legs", () => {
    const paired = detectInternalTransferPairIds([
      tx({
        id: "salary",
        direction: DomainTransactionDirection.INFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T06:20:29Z",
        description: "Recebimento de proventos - Pagamento De Proventos",
      }),
      tx({
        id: "out",
        direction: DomainTransactionDirection.OUTFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:11Z",
        description: "Pix enviado - Thierry Barreto De Castro",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:12Z",
        description: "Transferência Recebida|THIERRY BARRETO DE CASTRO",
      }),
    ]);
    expect(paired.has("salary")).toBe(false);
    expect(paired.has("out")).toBe(true);
    expect(paired.has("in")).toBe(true);
  });

  it("does not pair transfers to different counterparties", () => {
    const paired = detectInternalTransferPairIds([
      tx({
        id: "out",
        direction: DomainTransactionDirection.OUTFLOW,
        amount: 500,
        occurredAt: "2026-07-01T10:00:00Z",
        description: "Pix enviado - Pamella Andrade da Mota",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 500,
        occurredAt: "2026-07-01T10:05:00Z",
        description: "Transferência Recebida|Ricardy Bruno Soares",
      }),
    ]);
    expect(paired.size).toBe(0);
  });

  it("does not pair legs outside the time window", () => {
    const paired = detectInternalTransferPairIds([
      tx({
        id: "out",
        direction: DomainTransactionDirection.OUTFLOW,
        amount: 858,
        occurredAt: "2026-07-01T10:00:00Z",
        description: "Pix enviado - Thierry Barreto de Castro",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 858,
        occurredAt: "2026-07-20T10:00:00Z",
        description: "Transferência Recebida|Thierry Barreto de Castro",
      }),
    ]);
    expect(paired.size).toBe(0);
  });
});

describe("normalizeBillStatus", () => {
  const now = new Date("2026-05-27T12:00:00Z");

  it("treats residual micro-values as closed instead of overdue", () => {
    expect(
      normalizeBillStatus(
        "OVERDUE",
        new Date("2026-05-01T00:00:00Z"),
        new Prisma.Decimal(0.0039),
        now,
      ),
    ).toBe("CLOSED");
    expect(
      normalizeBillStatus(
        "OPEN",
        new Date("2026-05-01T00:00:00Z"),
        new Prisma.Decimal(-0.0029),
        now,
      ),
    ).toBe("CLOSED");
  });

  it("still marks a real unpaid past bill as overdue", () => {
    expect(
      normalizeBillStatus(
        "OPEN",
        new Date("2026-05-20T00:00:00Z"),
        new Prisma.Decimal(320.5),
        now,
      ),
    ).toBe("OVERDUE");
  });
});

describe("isActiveInvestmentPosition", () => {
  it("does not count closed or zero-value positions as active", () => {
    expect(
      isActiveInvestmentPosition(new Prisma.Decimal(0), "TOTAL_WITHDRAWAL"),
    ).toBe(false);
    expect(isActiveInvestmentPosition(new Prisma.Decimal(0), "ACTIVE")).toBe(
      false,
    );
  });

  it("counts a funded open position", () => {
    expect(isActiveInvestmentPosition(new Prisma.Decimal(100), "ACTIVE")).toBe(
      true,
    );
  });
});

describe("isOutstandingBill", () => {
  const now = new Date("2026-05-27T12:00:00Z");

  it("ignores historical closed bills and includes unpaid due bills", () => {
    expect(
      isOutstandingBill(
        "CLOSED",
        new Date("2026-04-10T00:00:00Z"),
        new Prisma.Decimal(1677.28),
        now,
      ),
    ).toBe(false);
    expect(
      isOutstandingBill(
        "OVERDUE",
        new Date("2026-05-20T00:00:00Z"),
        new Prisma.Decimal(10.18),
        now,
      ),
    ).toBe(true);
  });
});
