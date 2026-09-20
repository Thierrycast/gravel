import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { projectNetWorth } from "./net-worth-projection";

const NOW = new Date(2026, 8, 20); // 20/09/2026, local
const base = new Prisma.Decimal(1000);

/** Primeiro dia do mês, `n` meses à frente de setembro/2026. */
const mesFuturo = (n: number) => new Date(2026, 8 + n, 1);

describe("projectNetWorth — o cenário precisa acumular", () => {
  it("mantém o efeito do evento nos meses seguintes", () => {
    // O bug: `scenarioNW = projectedNW` no começo de cada iteração. Um evento
    // de +10.000 em novembro aparecia em novembro e sumia em dezembro.
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [{ date: new Date(2026, 10, 15), amount: 10_000 }], // novembro
      lookaheadMonths: 4,
      now: NOW,
    });

    const [outubro, novembro, dezembro, janeiro] = pontos;

    expect(outubro.scenarioNetWorth.toString()).toBe("1000");
    expect(novembro.scenarioNetWorth.toString()).toBe("11000");
    // É aqui que quebrava: voltava para 1000.
    expect(dezembro.scenarioNetWorth.toString()).toBe("11000");
    expect(janeiro.scenarioNetWorth.toString()).toBe("11000");
  });

  it("soma vários eventos ao longo do tempo", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [
        { date: new Date(2026, 9, 5), amount: 500 },
        { date: new Date(2026, 10, 5), amount: 300 },
        { date: new Date(2026, 11, 5), amount: -200 },
      ],
      lookaheadMonths: 4,
      now: NOW,
    });

    expect(pontos.map((p) => p.scenarioNetWorth.toString())).toEqual([
      "1500",
      "1800",
      "1600",
      "1600",
    ]);
  });

  it("vários eventos no mesmo mês entram todos", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [
        { date: new Date(2026, 9, 2), amount: 100 },
        { date: new Date(2026, 9, 20), amount: 200 },
      ],
      lookaheadMonths: 2,
      now: NOW,
    });

    expect(pontos[0].scenarioNetWorth.toString()).toBe("1300");
  });
});

describe("projectNetWorth — salário", () => {
  it("entra nas duas linhas, mês a mês", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 100,
      includeSalary: true,
      scenarios: [],
      lookaheadMonths: 3,
      now: NOW,
    });

    expect(pontos.map((p) => p.netWorth.toString())).toEqual(["1100", "1200", "1300"]);
    expect(pontos.map((p) => p.scenarioNetWorth.toString())).toEqual(["1100", "1200", "1300"]);
  });

  it("salário e cenário compõem juntos", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 100,
      includeSalary: true,
      scenarios: [{ date: new Date(2026, 9, 10), amount: 1000 }], // outubro
      lookaheadMonths: 3,
      now: NOW,
    });

    // base sobe só com salário; cenário carrega o evento adiante.
    expect(pontos.map((p) => p.netWorth.toString())).toEqual(["1100", "1200", "1300"]);
    expect(pontos.map((p) => p.scenarioNetWorth.toString())).toEqual(["2100", "2200", "2300"]);
  });

  it("não soma salário quando desligado", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 5000,
      includeSalary: false,
      scenarios: [],
      lookaheadMonths: 2,
      now: NOW,
    });
    expect(pontos.every((p) => p.netWorth.toString() === "1000")).toBe(true);
  });
});

describe("projectNetWorth — bordas", () => {
  it("evento no último instante do mês ainda conta naquele mês", () => {
    // monthEnd era `new Date(ano, mês+1, 0)` — meia-noite do último dia. Um
    // evento carimbado às 23h do dia 31 ficava de fora de todos os meses.
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [{ date: new Date(2026, 9, 31, 23, 0), amount: 700 }],
      lookaheadMonths: 2,
      now: NOW,
    });
    expect(pontos[0].scenarioNetWorth.toString()).toBe("1700");
  });

  it("evento no passado não entra em mês nenhum", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [{ date: new Date(2026, 0, 10), amount: 999 }],
      lookaheadMonths: 3,
      now: NOW,
    });
    expect(pontos.every((p) => p.scenarioNetWorth.toString() === "1000")).toBe(true);
  });

  it("aceita data em string e ignora data inválida", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [
        { date: "2026-10-10T12:00:00", amount: 50 },
        { date: "nem data", amount: 9999 },
      ],
      lookaheadMonths: 2,
      now: NOW,
    });
    expect(pontos[0].scenarioNetWorth.toString()).toBe("1050");
  });

  it("projeta o primeiro dia de cada mês seguinte", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [],
      lookaheadMonths: 4,
      now: NOW,
    });
    expect(pontos.map((p) => p.date.getTime())).toEqual(
      [1, 2, 3, 4].map((n) => mesFuturo(n).getTime()),
    );
  });

  it("atravessa a virada de ano sem se perder", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [{ date: new Date(2027, 0, 15), amount: 400 }],
      lookaheadMonths: 5,
      now: NOW,
    });
    // set + 4 = janeiro/2027
    expect(pontos[3].date.getFullYear()).toBe(2027);
    expect(pontos[3].date.getMonth()).toBe(0);
    expect(pontos[3].scenarioNetWorth.toString()).toBe("1400");
    expect(pontos[4].scenarioNetWorth.toString()).toBe("1400");
  });

  it("amount nulo não quebra a projeção", () => {
    const pontos = projectNetWorth({
      currentNetWorth: base,
      monthlySalary: 0,
      includeSalary: false,
      scenarios: [{ date: new Date(2026, 9, 10), amount: null }],
      lookaheadMonths: 2,
      now: NOW,
    });
    expect(pontos[0].scenarioNetWorth.toString()).toBe("1000");
  });
});
