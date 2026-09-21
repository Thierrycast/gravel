import { DomainTransactionDirection, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  filterOperationalIncome,
  filterOperationalSpending,
  type ClassifiableTransaction,
} from "./spending-query";

let sequence = 0;

function tx(overrides: Partial<ClassifiableTransaction> = {}): ClassifiableTransaction {
  sequence += 1;
  return {
    id: `tx-${sequence}`,
    amount: new Prisma.Decimal(100),
    direction: DomainTransactionDirection.OUTFLOW,
    occurredAt: new Date(2026, 8, 10, 12),
    description: "MERCADO BOM PRECO",
    normalizedDescription: null,
    domainCategoryId: "cat-1",
    domainAccountId: "acc-1",
    domainCategory: { name: "Mercado", kind: "EXPENSE" },
    domainMerchant: null,
    ...overrides,
  };
}

describe("filterOperationalSpending", () => {
  it("mantém gasto comum", () => {
    const resultado = filterOperationalSpending([tx()]);
    expect(resultado).toHaveLength(1);
  });

  it("exclui pagamento de fatura de cartão", () => {
    // Era isso que inflava a categoria e disparava "orçamento estourado".
    const resultado = filterOperationalSpending([
      tx({ domainCategory: { name: "Pagamento de cartão de crédito", kind: "EXPENSE" } }),
    ]);
    expect(resultado).toEqual([]);
  });

  it("exclui transferência de mesma titularidade", () => {
    const resultado = filterOperationalSpending([
      tx({ domainCategory: { name: "Transferência mesma titularidade", kind: "TRANSFER" } }),
    ]);
    expect(resultado).toEqual([]);
  });

  it("exclui aporte e resgate de investimento", () => {
    const resultado = filterOperationalSpending([
      tx({ domainCategory: { name: "Aplicação", kind: "EXPENSE" } }),
      tx({ domainCategory: { name: "Aporte", kind: "EXPENSE" } }),
    ]);
    expect(resultado).toEqual([]);
  });

  it("exclui as DUAS pontas de uma transferência entre contas próprias", () => {
    // O caso do relatório: Pix de conta A para conta B do mesmo usuário. As
    // duas pernas somavam no orçamento porque a query não pareava nada.
    // O pareamento casa pela contraparte extraída da descrição mais o valor —
    // daí o nome depois do separador, que é como o banco de fato manda.
    const saida = tx({
      id: "saida",
      direction: DomainTransactionDirection.OUTFLOW,
      amount: new Prisma.Decimal(3000),
      description: "Transferência Enviada|ANA PAULA DE SOUZA LIMA",
      domainAccountId: "acc-1",
      domainCategory: { name: "Transferências", kind: "TRANSFER" },
    });
    const entrada = tx({
      id: "entrada",
      direction: DomainTransactionDirection.INFLOW,
      amount: new Prisma.Decimal(3000),
      description: "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
      domainAccountId: "acc-2",
      domainCategory: { name: "Transferências", kind: "TRANSFER" },
    });

    expect(filterOperationalSpending([saida, entrada])).toEqual([]);
  });

  it("não deixa entrada passar como gasto", () => {
    const resultado = filterOperationalSpending([
      tx({ direction: DomainTransactionDirection.INFLOW, description: "SALARIO" }),
    ]);
    expect(resultado).toEqual([]);
  });

  it("lista vazia não quebra", () => {
    expect(filterOperationalSpending([])).toEqual([]);
  });
});

describe("filterOperationalIncome", () => {
  it("mantém entrada de verdade", () => {
    const resultado = filterOperationalIncome([
      tx({
        direction: DomainTransactionDirection.INFLOW,
        description: "SALARIO EMPRESA X",
        domainCategory: { name: "Salário", kind: "INCOME" },
      }),
    ]);
    expect(resultado).toHaveLength(1);
  });

  it("Pix de R$ 3.000 entre contas próprias não é receita", () => {
    // AUD-002: este era marcado como "possível salário" na Inbox.
    const saida = tx({
      id: "saida",
      direction: DomainTransactionDirection.OUTFLOW,
      amount: new Prisma.Decimal(3000),
      description: "Transferência Enviada|ANA PAULA DE SOUZA LIMA",
      domainAccountId: "acc-1",
      domainCategory: { name: "Transferências", kind: "TRANSFER" },
    });
    const entrada = tx({
      id: "entrada",
      direction: DomainTransactionDirection.INFLOW,
      amount: new Prisma.Decimal(3000),
      description: "Transferência Recebida|ANA PAULA DE SOUZA LIMA",
      domainAccountId: "acc-2",
      domainCategory: { name: "Transferências", kind: "TRANSFER" },
    });

    expect(filterOperationalIncome([saida, entrada])).toEqual([]);
  });

  it("pagamento de fatura recebido não vira receita", () => {
    const resultado = filterOperationalIncome([
      tx({
        direction: DomainTransactionDirection.INFLOW,
        description: "PAGAMENTO DE FATURA",
        domainCategory: { name: "Pagamento de fatura", kind: "EXPENSE" },
      }),
    ]);
    expect(resultado).toEqual([]);
  });

  it("não deixa saída passar como receita", () => {
    expect(filterOperationalIncome([tx()])).toEqual([]);
  });
});
