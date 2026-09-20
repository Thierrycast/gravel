import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { isoDate, positiveMoney, requiredText, roundToCents, toMoneyDecimal } from "./money";

describe("roundToCents", () => {
  it("corta a sujeira de float que vinha do JSON", () => {
    // O caso exato da auditoria: 10.15 * 1.2 em JavaScript.
    expect(roundToCents(10.15 * 1.2)).toBe(12.18);
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
  });

  it("arredonda sobre o double que de fato chegou, não sobre o decimal digitado", () => {
    // Nenhum destes é um "meio" exato em binário, e o lado para onde caem
    // depende de onde o double realmente está. Documentado porque surpreende:
    expect(roundToCents(1.005)).toBe(1.0); //  1.00499999999999989...
    expect(roundToCents(1.015)).toBe(1.01); // 1.01499999999999990...
    expect(roundToCents(2.345)).toBe(2.35); // 2.34500000000000019...
  });

  it("garante o que importa: duas casas e menos de meio centavo de desvio", () => {
    const valores = [0, 1.005, 1.015, 2.345, 10.15 * 1.2, 1 / 3, 1234.5678, 0.005];
    for (const valor of valores) {
      const arredondado = roundToCents(valor);
      expect(Math.abs(arredondado - valor)).toBeLessThanOrEqual(0.005);
      // Duas casas de verdade: multiplicar por 100 dá inteiro exato.
      expect(arredondado * 100).toBe(Math.round(arredondado * 100));
    }
  });

  it("deixa valor já redondo intacto", () => {
    expect(roundToCents(100)).toBe(100);
    expect(roundToCents(19.9)).toBe(19.9);
    expect(roundToCents(0.01)).toBe(0.01);
  });

  it("recusa número que não é número", () => {
    expect(() => roundToCents(Number.NaN)).toThrow(TypeError);
    expect(() => roundToCents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("toMoneyDecimal", () => {
  it("guarda exatamente o valor arredondado", () => {
    expect(toMoneyDecimal(10.15 * 1.2).toString()).toBe("12.18");
    expect(toMoneyDecimal(0.1 + 0.2).toString()).toBe("0.3");
  });

  it("não repete o erro de passar float direto para o Decimal", () => {
    // É isto que a rota fazia antes, via Prisma: o float sujo ia inteiro.
    expect(new Prisma.Decimal(0.1 + 0.2).toString()).toBe("0.30000000000000004");
    expect(toMoneyDecimal(0.1 + 0.2).toString()).toBe("0.3");
  });

  it("soma de Decimals arredondados fecha a conta", () => {
    const parcelas = [toMoneyDecimal(0.1), toMoneyDecimal(0.2)];
    const total = parcelas.reduce((acc, value) => acc.plus(value), new Prisma.Decimal(0));
    expect(total.toString()).toBe("0.3");
  });
});

describe("positiveMoney", () => {
  it("aceita valor positivo e já devolve arredondado", () => {
    expect(positiveMoney.parse(12.180000000000001)).toBe(12.18);
  });

  it.each([0, -1, -0.01, Number.NaN, Number.POSITIVE_INFINITY])("recusa %s", (value) => {
    expect(positiveMoney.safeParse(value).success).toBe(false);
  });

  it("recusa string, mesmo que pareça número", () => {
    expect(positiveMoney.safeParse("10").success).toBe(false);
  });
});

describe("isoDate", () => {
  it("aceita ISO e timestamp", () => {
    expect(isoDate.parse("2026-09-20T12:00:00.000Z").toISOString()).toBe(
      "2026-09-20T12:00:00.000Z",
    );
    expect(isoDate.parse(1_758_369_600_000)).toBeInstanceOf(Date);
  });

  it("recusa data que não existe", () => {
    expect(isoDate.safeParse("nem data").success).toBe(false);
    expect(isoDate.safeParse("2026-13-45").success).toBe(false);
  });
});

describe("requiredText", () => {
  it("corta espaço e exige conteúdo", () => {
    expect(requiredText("Descrição").parse("  mercado  ")).toBe("mercado");
    expect(requiredText("Descrição").safeParse("   ").success).toBe(false);
    expect(requiredText("Descrição").safeParse("").success).toBe(false);
  });

  it("respeita o limite de tamanho", () => {
    expect(requiredText("Descrição", 5).safeParse("123456").success).toBe(false);
    expect(requiredText("Descrição", 5).safeParse("12345").success).toBe(true);
  });
});
