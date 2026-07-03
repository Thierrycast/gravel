import { DomainTransactionDirection, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  classifyCashFlowTransaction,
  isActiveInvestmentPosition,
  isOutstandingBill,
} from "./shared";

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
