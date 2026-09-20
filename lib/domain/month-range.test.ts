import { describe, expect, it } from "vitest";

import { currentMonthKey, monthRange } from "./review";

describe("monthRange", () => {
  const meio = new Date(2026, 8, 20, 14, 30); // 20/09/2026

  it("abre no primeiro instante e fecha no último do mês de calendário", () => {
    const janela = monthRange("2026-09", meio);
    expect(janela.from.getDate()).toBe(1);
    expect(janela.from.getHours()).toBe(0);
    expect(janela.to.getDate()).toBe(30);
    expect(janela.to.getHours()).toBe(23);
    expect(janela.to.getMilliseconds()).toBe(999);
  });

  it("no mês corrente, o realizado para em agora — não no fim do mês", () => {
    // O bug: o Fechamento somava até 30/09 23:59 enquanto o Dashboard
    // (period=mtd) cortava em hoje. Duas telas, o mesmo rótulo "este mês",
    // números diferentes.
    const janela = monthRange("2026-09", meio);
    expect(janela.realizedTo.getTime()).toBe(meio.getTime());
    expect(janela.isPartial).toBe(true);
    expect(janela.isCurrentMonth).toBe(true);
  });

  it("em mês passado, o realizado é o mês inteiro", () => {
    const janela = monthRange("2026-07", meio);
    expect(janela.realizedTo.getTime()).toBe(janela.to.getTime());
    expect(janela.isPartial).toBe(false);
    expect(janela.isCurrentMonth).toBe(false);
  });

  it("em mês futuro, nada foi realizado ainda", () => {
    const janela = monthRange("2026-12", meio);
    expect(janela.realizedTo.getTime()).toBe(meio.getTime());
    expect(janela.isPartial).toBe(true);
    expect(janela.isCurrentMonth).toBe(false);
  });

  it("acerta fevereiro, inclusive bissexto", () => {
    expect(monthRange("2026-02", meio).to.getDate()).toBe(28);
    expect(monthRange("2028-02", meio).to.getDate()).toBe(29);
  });

  it("acerta dezembro sem virar o ano", () => {
    const janela = monthRange("2026-12", new Date(2026, 11, 15));
    expect(janela.to.getMonth()).toBe(11);
    expect(janela.to.getDate()).toBe(31);
    expect(janela.from.getFullYear()).toBe(2026);
  });

  it("currentMonthKey devolve a chave do mês de agora", () => {
    expect(currentMonthKey(meio)).toBe("2026-09");
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe("2026-01");
  });
});
