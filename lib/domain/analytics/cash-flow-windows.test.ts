import { describe, expect, it } from "vitest";

import { parseDateParam } from "@/lib/core/filters";

import { formatWindowBound, getCashFlowComparisonWindows } from "./cash-flow";

/**
 * O "bug do último dia": a janela de comparação era serializada com
 * `.toISOString().split("T")[0]`, jogando fora a hora. Como `to` é o último
 * instante do mês em horário LOCAL, num fuso a oeste ele já está no dia
 * seguinte em UTC — e a janela de setembro passava a incluir 1º de outubro.
 * Em fuso a leste o erro é o simétrico: o dia 30 inteiro some da comparação.
 */
describe("janelas de comparação de fluxo de caixa", () => {
  it("o limite sobrevive à ida e volta pela query string", () => {
    for (const periodType of ["month", "quarter", "semester"] as const) {
      const windows = getCashFlowComparisonWindows(periodType, 4);
      for (const window of windows) {
        const ida = formatWindowBound(window.to);
        const volta = parseDateParam(ida)!;
        expect(volta.getTime()).toBe(window.to.getTime());
      }
    }
  });

  it("o limite superior continua sendo o último instante do período", () => {
    const [atual] = getCashFlowComparisonWindows("month", 2);
    const volta = parseDateParam(formatWindowBound(atual.to))!;

    expect(volta.getHours()).toBe(23);
    expect(volta.getMinutes()).toBe(59);
    expect(volta.getMilliseconds()).toBe(999);
  });

  it("o limite superior não escorrega para o mês seguinte", () => {
    // É este o sintoma que aparecia na tela: gasto do dia 1º entrando no mês
    // anterior, ou gasto do dia 30 sumindo.
    const [atual] = getCashFlowComparisonWindows("month", 2);
    const volta = parseDateParam(formatWindowBound(atual.to))!;
    expect(volta.getMonth()).toBe(atual.from.getMonth());
    expect(volta.getFullYear()).toBe(atual.from.getFullYear());
  });

  it("as janelas não se sobrepõem nem deixam buraco", () => {
    const windows = getCashFlowComparisonWindows("month", 4);
    // Vêm da mais recente para a mais antiga.
    for (let i = 1; i < windows.length; i += 1) {
      const maisNova = windows[i - 1];
      const maisVelha = windows[i];
      expect(maisVelha.to.getTime()).toBeLessThan(maisNova.from.getTime());
      // Encostam: o fim de uma é 1ms antes do começo da seguinte.
      expect(maisNova.from.getTime() - maisVelha.to.getTime()).toBe(1);
    }
  });

  it("pede o número de janelas solicitado", () => {
    expect(getCashFlowComparisonWindows("month", 2)).toHaveLength(2);
    expect(getCashFlowComparisonWindows("quarter", 4)).toHaveLength(4);
  });
});
