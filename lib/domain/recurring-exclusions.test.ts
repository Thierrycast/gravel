import { describe, expect, it } from "vitest";

import { isFinancialChargeDescription } from "./recurring-exclusions";

describe("isFinancialChargeDescription", () => {
  it.each([
    "Juros do Rotativo",
    "JUROS ROTATIVO",
    "IOF",
    "IOF sobre compras internacionais",
    "Multa por atraso",
    "Encargos de financiamento",
    "Juros de mora",
    "Correção monetária",
  ])("reconhece encargo: %s", (texto) => {
    // Estes entram todo mês com a mesma descrição e valor parecido — e o
    // detector de recorrência os transformava em "assinatura".
    expect(isFinancialChargeDescription(texto)).toBe(true);
  });

  it.each([
    "Netflix",
    "Spotify Premium",
    "Academia Smart Fit",
    "Moradia — aluguel",
    "Seguro residencial",
    "Mercado Livre",
  ])("não confunde assinatura de verdade com encargo: %s", (texto) => {
    expect(isFinancialChargeDescription(texto)).toBe(false);
  });

  it("casa palavra inteira, não pedaço", () => {
    // "mora" dentro de "moradia" não é encargo. "iof" dentro de um nome
    // qualquer também não.
    expect(isFinancialChargeDescription("Moradia")).toBe(false);
    expect(isFinancialChargeDescription("Bioflora")).toBe(false);
    expect(isFinancialChargeDescription("mora")).toBe(true);
  });

  it("olha todos os campos oferecidos", () => {
    expect(isFinancialChargeDescription(null, "IOF", undefined)).toBe(true);
    expect(isFinancialChargeDescription("Compra", null, "juros")).toBe(true);
  });

  it("texto vazio não é encargo", () => {
    expect(isFinancialChargeDescription()).toBe(false);
    expect(isFinancialChargeDescription(null, undefined, "")).toBe(false);
  });
});
