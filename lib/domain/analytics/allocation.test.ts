import { DomainAccountKind, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { CREDIT_ACCOUNT_KINDS, summarizeAccountAllocation } from "./allocation";

const conta = (
  name: string,
  kind: DomainAccountKind,
  balance: number,
  currencyCode = "BRL",
) => ({
  id: name,
  name,
  kind,
  balance: new Prisma.Decimal(balance),
  currencyCode,
  institutionName: null,
  sourceProvider: "MANUAL",
});

const RATE = 5;

describe("summarizeAccountAllocation", () => {
  it("não conta dívida de cartão como ativo", () => {
    // O núcleo do bug: a Pluggy modela a dívida do cartão como saldo
    // POSITIVO. O filtro era só `balance > 0`, então a fatura de R$ 2.000
    // entrava em assetsTotal como se fosse dinheiro do usuário.
    const resultado = summarizeAccountAllocation(
      [
        conta("Corrente", DomainAccountKind.BANK, 1000),
        conta("Cartão", DomainAccountKind.CARD, 2000),
      ],
      RATE,
      10,
    );

    expect(resultado.assetsTotal.toString()).toBe("1000");
  });

  it("patrimônio líquido subtrai a dívida do cartão", () => {
    const resultado = summarizeAccountAllocation(
      [
        conta("Corrente", DomainAccountKind.BANK, 1000),
        conta("Cartão", DomainAccountKind.CARD, 2000),
      ],
      RATE,
      10,
    );

    expect(resultado.netWorth.toString()).toBe("-1000");
  });

  it("sharePercent usa só ativos — cartão não dilui a fatia de ninguém", () => {
    const resultado = summarizeAccountAllocation(
      [
        conta("Corrente", DomainAccountKind.BANK, 750),
        conta("Poupança", DomainAccountKind.BANK, 250),
        conta("Cartão", DomainAccountKind.CARD, 1000),
      ],
      RATE,
      10,
    );

    const corrente = resultado.byAccount.find((a) => a.name === "Corrente");
    expect(corrente?.sharePercent.toString()).toBe("75");
  });

  it("converte stablecoin como dólar na alocação", () => {
    // `normalizeCurrencyCode(x) === "USD"` deixava USDT passar sem conversão:
    // 1000 USDT entravam como 1000 BRL na fatia e no total por tipo.
    const resultado = summarizeAccountAllocation(
      [conta("Binance", DomainAccountKind.CRYPTO, 1000, "USDT")],
      RATE,
      10,
    );

    expect(resultado.assetsTotal.toString()).toBe("5000");
    expect(resultado.byAccount[0]?.sharePercent.toString()).toBe("100");
  });

  it("converte dólar de verdade também", () => {
    const resultado = summarizeAccountAllocation(
      [conta("Wise", DomainAccountKind.BANK, 100, "USD")],
      RATE,
      10,
    );
    expect(resultado.assetsTotal.toString()).toBe("500");
  });

  it("não trata euro como dólar, e diz que não soube converter", () => {
    const resultado = summarizeAccountAllocation(
      [conta("Europa", DomainAccountKind.BANK, 100, "EUR")],
      RATE,
      10,
    );
    expect(resultado.assetsTotal.toString()).toBe("100");
    expect(resultado.unsupportedCurrencies).toEqual(["EUR"]);
  });

  it("agrupa por tipo, com crédito entrando negativo", () => {
    const resultado = summarizeAccountAllocation(
      [
        conta("Corrente", DomainAccountKind.BANK, 1000),
        conta("Cartão", DomainAccountKind.CARD, 300),
      ],
      RATE,
      10,
    );

    const porTipo = Object.fromEntries(
      resultado.byKind.map((row) => [row.kind, row.balance.toString()]),
    );
    expect(porTipo[DomainAccountKind.BANK]).toBe("1000");
    expect(porTipo[DomainAccountKind.CARD]).toBe("-300");
  });

  it("conta a descoberto não vira ativo", () => {
    const resultado = summarizeAccountAllocation(
      [
        conta("Corrente", DomainAccountKind.BANK, -500),
        conta("Poupança", DomainAccountKind.BANK, 1000),
      ],
      RATE,
      10,
    );
    expect(resultado.assetsTotal.toString()).toBe("1000");
    expect(resultado.netWorth.toString()).toBe("500");
  });

  it("aguenta lista vazia sem dividir por zero", () => {
    const resultado = summarizeAccountAllocation([], RATE, 10);
    expect(resultado.assetsTotal.toString()).toBe("0");
    expect(resultado.netWorth.toString()).toBe("0");
    expect(resultado.byAccount).toEqual([]);
  });

  it("respeita o limite de contas listadas sem mexer nos totais", () => {
    const contas = Array.from({ length: 5 }, (_, i) =>
      conta(`Conta ${i}`, DomainAccountKind.BANK, 100),
    );
    const resultado = summarizeAccountAllocation(contas, RATE, 2);
    expect(resultado.byAccount).toHaveLength(2);
    expect(resultado.assetsTotal.toString()).toBe("500");
  });
});

describe("CREDIT_ACCOUNT_KINDS", () => {
  it("é uma definição só, com valor que existe no enum", () => {
    // Havia duas no mesmo arquivo: um Set tipado com CARD, e outro com as
    // strings ["CARD", "CREDIT"] — sendo que CREDIT não existe em
    // DomainAccountKind e nunca casou com nada.
    expect([...CREDIT_ACCOUNT_KINDS]).toEqual([DomainAccountKind.CARD]);
    for (const kind of CREDIT_ACCOUNT_KINDS) {
      expect(Object.values(DomainAccountKind)).toContain(kind);
    }
  });
});
