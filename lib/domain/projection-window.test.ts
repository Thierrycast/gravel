import { describe, expect, it } from "vitest";

import { variableExpenseDivisor } from "./projection-window";

const NOW = new Date(2026, 8, 20);
const diasAtras = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("variableExpenseDivisor", () => {
  it("usa a janela cheia quando há histórico suficiente", () => {
    expect(variableExpenseDivisor(diasAtras(90), NOW)).toBe(3);
    expect(variableExpenseDivisor(diasAtras(365), NOW)).toBe(3);
  });

  it("não divide por 3 quem só tem um mês de extrato", () => {
    // O bug: usuário novo, 30 dias de histórico, gasto variável projetado
    // pela terça parte do real.
    expect(variableExpenseDivisor(diasAtras(30), NOW)).toBe(1);
  });

  it("acompanha o histórico parcial proporcionalmente", () => {
    expect(variableExpenseDivisor(diasAtras(60), NOW)).toBe(2);
    expect(variableExpenseDivisor(diasAtras(45), NOW)).toBe(1.5);
  });

  it("nunca desce abaixo de 1 — menos de um mês não vira multiplicação", () => {
    // Dividir por 0,2 transformaria o gasto de seis dias em cinco vezes ele
    // mesmo. Melhor subestimar do que inventar.
    expect(variableExpenseDivisor(diasAtras(6), NOW)).toBe(1);
    expect(variableExpenseDivisor(NOW, NOW)).toBe(1);
  });

  it("nunca passa da janela, mesmo com histórico antigo", () => {
    expect(variableExpenseDivisor(new Date(2020, 0, 1), NOW)).toBe(3);
  });

  it("sem histórico, devolve a janela cheia", () => {
    expect(variableExpenseDivisor(null, NOW)).toBe(3);
    expect(variableExpenseDivisor(undefined, NOW)).toBe(3);
  });

  it("respeita uma janela diferente", () => {
    expect(variableExpenseDivisor(diasAtras(180), NOW, 180)).toBe(6);
    expect(variableExpenseDivisor(diasAtras(60), NOW, 180)).toBe(2);
  });

  it("data inválida não propaga NaN para a projeção", () => {
    expect(variableExpenseDivisor(new Date("nem data"), NOW)).toBe(3);
  });
});
