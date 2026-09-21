import { describe, expect, it } from "vitest";

import { occurrenceDatesInMonth } from "./recurring";

const mes = (ano: number, mes: number) => ({
  monthStart: new Date(Date.UTC(ano, mes - 1, 1)),
  monthEnd: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
});

const dia = (d: Date | undefined) => d?.getUTCDate();

describe("occurrenceDatesInMonth — dia-âncora", () => {
  const anchor = new Date(Date.UTC(2026, 0, 31)); // 31/01/2026

  it("fevereiro clampa para o último dia", () => {
    const { monthStart, monthEnd } = mes(2026, 2);
    const [ocorrencia] = occurrenceDatesInMonth("MONTHLY", anchor, monthStart, monthEnd, 31);
    expect(dia(ocorrencia)).toBe(28);
  });

  it("março volta para o dia 31 — a âncora não foi perdida", () => {
    // É este o ponto: sem anchorDay, uma regra cobrada em 28/02 passava a ser
    // projetada no dia 28 para sempre.
    const { monthStart, monthEnd } = mes(2026, 3);
    const [ocorrencia] = occurrenceDatesInMonth("MONTHLY", anchor, monthStart, monthEnd, 31);
    expect(dia(ocorrencia)).toBe(31);
  });

  it("abril, que tem 30 dias, clampa para 30 e não contamina maio", () => {
    const abril = mes(2026, 4);
    const maio = mes(2026, 5);
    expect(dia(occurrenceDatesInMonth("MONTHLY", anchor, abril.monthStart, abril.monthEnd, 31)[0])).toBe(30);
    expect(dia(occurrenceDatesInMonth("MONTHLY", anchor, maio.monthStart, maio.monthEnd, 31)[0])).toBe(31);
  });

  it("fevereiro bissexto vai até 29", () => {
    const { monthStart, monthEnd } = mes(2028, 2);
    const base = new Date(Date.UTC(2028, 0, 31));
    expect(dia(occurrenceDatesInMonth("MONTHLY", base, monthStart, monthEnd, 31)[0])).toBe(29);
  });

  it("sem anchorDay, o dia vem da data base — comportamento anterior preservado", () => {
    const base = new Date(Date.UTC(2026, 1, 28));
    const { monthStart, monthEnd } = mes(2026, 3);
    expect(dia(occurrenceDatesInMonth("MONTHLY", base, monthStart, monthEnd)[0])).toBe(28);
  });

  it.each([0, -1, 32, 1.5, null, undefined])(
    "anchorDay inválido (%s) é ignorado em vez de quebrar a projeção",
    (invalido) => {
      const base = new Date(Date.UTC(2026, 1, 28));
      const { monthStart, monthEnd } = mes(2026, 3);
      const resultado = occurrenceDatesInMonth(
        "MONTHLY",
        base,
        monthStart,
        monthEnd,
        invalido as number | null,
      );
      expect(dia(resultado[0])).toBe(28);
    },
  );

  it("vale também para trimestral", () => {
    // Novembro tem 30 dias: Date.UTC(2026, 10, 31) viraria 1º de dezembro e
    // desalinharia o trimestre. A âncora de dia vai em anchorDay, não na data.
    const base = new Date(Date.UTC(2026, 10, 30));
    const { monthStart, monthEnd } = mes(2027, 2);
    const resultado = occurrenceDatesInMonth("QUARTERLY", base, monthStart, monthEnd, 31);
    expect(dia(resultado[0])).toBe(28);
  });

  it("semanal ignora anchorDay — o dia do mês não governa ali", () => {
    const base = new Date(Date.UTC(2026, 8, 1));
    const { monthStart, monthEnd } = mes(2026, 9);
    const resultado = occurrenceDatesInMonth("WEEKLY", base, monthStart, monthEnd, 31);
    expect(resultado.length).toBeGreaterThan(3);
  });
});
