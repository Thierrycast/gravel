import { DomainTransactionDirection, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  classifyCashFlowTransaction,
  detectInternalTransferPairIds,
  extractTransferCounterparty,
  formatBucket,
  isActiveInvestmentPosition,
  isOutstandingBill,
  normalizeBillStatus,
  resolvePeriodStart,
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
  it("never treats an inflow on a card account as income", () => {
    // Quitação com descrição de banco ("Inclusao de Pagamento Ciclo Corrente")
    // e estorno de compra caíam como renda por virem com categoria genérica.
    for (const [category, description] of [
      ["Transferências", "Inclusao de Pagamento Ciclo Corrente"],
      ["Compras online", "MERCADOLIVRE*MERCADOLIVRE"],
    ]) {
      expect(
        classifyCashFlowTransaction(
          DomainTransactionDirection.INFLOW,
          category,
          null,
          description,
          { accountKind: "CARD" },
        ),
      ).toBe("excluded");
    }
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Transferências",
        null,
        "Transferência Recebida|CLIENTE EXEMPLO",
        { accountKind: "BANK" },
      ),
    ).toBe("income");
  });

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
        "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
        {
          salaryPatterns: ["transferencia recebida|ana paula de souza lima"],
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
        "Transferência Enviada|ANA PAULA DE SOUZA LIMA",
        {
          salaryPatterns: ["ana paula de souza lima"],
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

  it("excludes a Pluggy bill payment even with a generic description", () => {
    expect(
      classifyCashFlowTransaction(
        DomainTransactionDirection.INFLOW,
        "Outros",
        "INCOME",
        "Crédito lançado",
        { metadataJson: JSON.stringify({ operationType: "PAGAMENTO_FATURA" }) },
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
        "Pagamento efetuado - Pagamento Fatura - ANA PAULA DE SOUZA LIMA",
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
        "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
      ),
    ).toBe("ana paula de souza lima");
  });

  it("extracts the name after a dash separator", () => {
    expect(
      extractTransferCounterparty("Pix enviado - Ana Paula De Souza Lima"),
    ).toBe("ana paula de souza lima");
  });

  it("strips document numbers embedded in the counterparty", () => {
    expect(
      extractTransferCounterparty(
        "Transferência Recebida|67.037.195 ANA PAULA DE SOUZA LIMA",
      ),
    ).toBe("ana paula de souza lima");
  });

  it("drops the preposition that links the phrase to the name", () => {
    // Sem isto, "Pix recebido de Fulano" ("de fulano ...") não pareava com o
    // envio "Transferência enviada|FULANO ..." e a auto-transferência virava renda.
    expect(
      extractTransferCounterparty("Pix recebido de Fulano Exemplo da Silva"),
    ).toBe("fulano exemplo da silva");
    expect(
      extractTransferCounterparty("Transferência enviada para Fulano Exemplo"),
    ).toBe("fulano exemplo");
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
        description: "Pix enviado - Ana Paula De Souza Lima",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:12Z",
        description: "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
      }),
    ]);
    expect(paired.has("out")).toBe(true);
    expect(paired.has("in")).toBe(true);
  });

  it("pairs a 'Pix recebido de' inflow with the 'enviada|NAME' outflow", () => {
    const paired = detectInternalTransferPairIds([
      tx({
        id: "out",
        direction: DomainTransactionDirection.OUTFLOW,
        amount: 1000,
        occurredAt: "2026-10-16T12:00:00Z",
        description: "Transferência enviada pelo Pix|FULANO EXEMPLO DA SILVA",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 1000,
        occurredAt: "2026-10-16T12:00:05Z",
        description: "Pix recebido de Fulano Exemplo da Silva",
      }),
    ]);
    expect([...paired].sort()).toEqual(["in", "out"]);
  });

  it("counts a self-transfer from an untracked account until that account is connected", () => {
    // Regra do Thierry: sem a perna de saída rastreada, é dinheiro novo no
    // sistema e conta. Conectada a conta de origem, o histórico traz a saída e o
    // par some da renda sozinho — inclusive nos meses passados, porque o
    // pareamento é feito a cada consulta, não gravado.
    const inflow = tx({
      id: "in",
      direction: DomainTransactionDirection.INFLOW,
      amount: 860,
      occurredAt: "2026-06-11T12:00:00Z",
      description: "Transferência Recebida|123.456.789 FULANO EXEMPLO DA SILVA",
    });
    expect(detectInternalTransferPairIds([inflow]).size).toBe(0);

    const outflowFromNewAccount = tx({
      id: "out",
      direction: DomainTransactionDirection.OUTFLOW,
      amount: 860,
      occurredAt: "2026-06-11T11:59:00Z",
      description: "Pix enviado - Fulano Exemplo da Silva",
    });
    expect([...detectInternalTransferPairIds([inflow, outflowFromNewAccount])].sort()).toEqual([
      "in",
      "out",
    ]);
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
        description: "Pix enviado - Ana Paula De Souza Lima",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 2811,
        occurredAt: "2026-07-01T15:47:12Z",
        description: "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
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
        description: "Pix enviado - Ana Paula de Souza Lima",
      }),
      tx({
        id: "in",
        direction: DomainTransactionDirection.INFLOW,
        amount: 858,
        occurredAt: "2026-07-20T10:00:00Z",
        description: "Transferência Recebida|Ana Paula de Souza Lima",
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

describe("resolvePeriodStart", () => {
  // 24/03 é a data que o relatório usa: 180 dias atrás de 20/09/2026.
  const to = new Date(Date.UTC(2026, 8, 20, 23, 59, 59, 999));

  it("períodos em dias contam dias corridos", () => {
    expect(resolvePeriodStart("7d", to)?.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    expect(resolvePeriodStart("30d", to)?.toISOString()).toBe("2026-08-21T23:59:59.999Z");
  });

  it("6m começa no dia 1 do sexto mês para trás, não 180 dias atrás", () => {
    // O bug: a página de fluxo de caixa pedia 180d, que cai em 24/03. O
    // agrupamento por mês então devolvia SETE chaves (março a setembro) para
    // um seletor que diz "6 meses" — e a média mensal saía dividida errado.
    const seisMeses = resolvePeriodStart("6m", to);
    expect(seisMeses?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("6m cobre exatamente seis chaves de mês", () => {
    const from = resolvePeriodStart("6m", to)!;
    const meses = new Set<string>();
    const cursor = new Date(from);
    while (cursor <= to) {
      meses.add(formatBucket(cursor, "month"));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    expect(meses.size).toBe(6);
    expect([...meses]).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("3m também é alinhado ao mês", () => {
    expect(resolvePeriodStart("3m", to)?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("6m atravessa a virada de ano", () => {
    const janeiro = new Date(Date.UTC(2027, 0, 15));
    expect(resolvePeriodStart("6m", janeiro)?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("mtd começa no dia 1 do mês corrente", () => {
    expect(resolvePeriodStart("mtd", to)?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("'all' e ausência de período seguem sem limite inferior", () => {
    expect(resolvePeriodStart("all", to)).toBeUndefined();
    expect(resolvePeriodStart(null, to)).toBeUndefined();
  });

  it("período desconhecido estoura em vez de virar 'desde sempre'", () => {
    // Antes caía no default e devolvia undefined. O Prisma lê `gte: undefined`
    // como "sem limite", então um seletor com valor novo passava a carregar o
    // histórico inteiro — silenciosamente, e com o payload explodindo.
    expect(() => resolvePeriodStart("6meses", to)).toThrow(/desconhecido/i);
    expect(() => resolvePeriodStart("ultimos-30", to)).toThrow(/desconhecido/i);
  });
});
