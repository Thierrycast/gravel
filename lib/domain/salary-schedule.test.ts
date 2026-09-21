import { describe, expect, it } from "vitest";

import {
  detectSalaryInterval,
  reduceSalaryOccurrences,
  salaryOccurrenceAmount,
} from "./salary-schedule";

const em = (ano: number, mes: number, dia: number, amount: number) => ({
  occurredAt: new Date(Date.UTC(ano, mes - 1, dia)),
  amount,
});

describe("reduceSalaryOccurrences", () => {
  it("preserva o adiantamento quinzenal — 40% no dia 15, 60% no dia 5", () => {
    // O bug: o motor reduzia o mês à MAIOR entrada, então o pagamento de 40%
    // era descartado e a projeção de caixa subestimava a receita todo mês.
    const mantidos = reduceSalaryOccurrences([
      em(2026, 9, 5, 6000),
      em(2026, 9, 15, 4000),
    ]);

    expect(mantidos.map((o) => o.amount)).toEqual([6000, 4000]);
  });

  it("descarta transferência pequena que casou o padrão por acidente", () => {
    // É por isto que a redução existia: o padrão de salário do usuário também
    // casa transferência própria. Tirar a redução traria esse bug de volta.
    const mantidos = reduceSalaryOccurrences([
      em(2026, 9, 5, 8000),
      em(2026, 9, 12, 200),
    ]);

    expect(mantidos.map((o) => o.amount)).toEqual([8000]);
  });

  it("aplica o corte mês a mês, não sobre o histórico inteiro", () => {
    // Um mês de salário alto não pode apagar o salário de um mês mais magro.
    const mantidos = reduceSalaryOccurrences([
      em(2026, 8, 5, 20000),
      em(2026, 9, 5, 3000),
    ]);

    expect(mantidos).toHaveLength(2);
  });

  it("mantém pagamentos iguais no mesmo mês", () => {
    const mantidos = reduceSalaryOccurrences([
      em(2026, 9, 5, 2500),
      em(2026, 9, 20, 2500),
    ]);
    expect(mantidos).toHaveLength(2);
  });

  it("devolve em ordem cronológica", () => {
    const mantidos = reduceSalaryOccurrences([
      em(2026, 9, 20, 2500),
      em(2026, 9, 5, 2500),
      em(2026, 8, 5, 2500),
    ]);
    expect(mantidos.map((o) => o.occurredAt.getTime())).toEqual(
      [...mantidos.map((o) => o.occurredAt.getTime())].sort((a, b) => a - b),
    );
  });

  it("lista vazia não quebra", () => {
    expect(reduceSalaryOccurrences([])).toEqual([]);
  });
});

describe("detectSalaryInterval", () => {
  it("dois pagamentos por mês é quinzenal", () => {
    const ocorrencias = [
      em(2026, 7, 5, 6000), em(2026, 7, 20, 4000),
      em(2026, 8, 5, 6000), em(2026, 8, 20, 4000),
      em(2026, 9, 5, 6000), em(2026, 9, 20, 4000),
    ];
    expect(detectSalaryInterval(ocorrencias)).toBe("BIWEEKLY");
  });

  it("um pagamento por mês continua mensal", () => {
    const ocorrencias = [
      em(2026, 7, 5, 8000),
      em(2026, 8, 5, 8000),
      em(2026, 9, 5, 8000),
    ];
    expect(detectSalaryInterval(ocorrencias)).toBe("MONTHLY");
  });

  it("um mês com 13º não promove o ano inteiro a quinzenal", () => {
    // Mediana, não média: é o que impede um bônus de virar periodicidade.
    const ocorrencias = [
      em(2026, 10, 5, 8000),
      em(2026, 11, 5, 8000),
      em(2026, 12, 5, 8000), em(2026, 12, 20, 8000),
    ];
    expect(detectSalaryInterval(ocorrencias)).toBe("MONTHLY");
  });

  it("quatro por mês é semanal", () => {
    const ocorrencias = [
      em(2026, 9, 3, 2000), em(2026, 9, 10, 2000),
      em(2026, 9, 17, 2000), em(2026, 9, 24, 2000),
      em(2026, 8, 3, 2000), em(2026, 8, 10, 2000),
      em(2026, 8, 17, 2000), em(2026, 8, 24, 2000),
    ];
    expect(detectSalaryInterval(ocorrencias)).toBe("WEEKLY");
  });

  it("o dia 15 e o dia 5 do mês seguinte ainda são quinzenais", () => {
    // Intervalos alternados de 20 e 10 dias: medir o intervalo MÉDIO daria 15
    // por coincidência. Contar por mês não se confunde.
    const ocorrencias = [
      em(2026, 7, 5, 6000), em(2026, 7, 15, 4000),
      em(2026, 8, 5, 6000), em(2026, 8, 15, 4000),
    ];
    expect(detectSalaryInterval(ocorrencias)).toBe("BIWEEKLY");
  });

  it("sem ocorrência nenhuma, assume mensal", () => {
    expect(detectSalaryInterval([])).toBe("MONTHLY");
  });
});

describe("salaryOccurrenceAmount", () => {
  it("mensal usa mediana — mês fraco não derruba a projeção", () => {
    const valor = salaryOccurrenceAmount("MONTHLY", [
      em(2026, 7, 5, 8000),
      em(2026, 8, 5, 8000),
      em(2026, 9, 5, 500),
    ]);
    expect(valor).toBe(8000);
  });

  it("quinzenal usa média — mediana inflaria o 40/60", () => {
    // Mediana de [4000, 4000, 6000, 6000] é 6000: a projeção passaria a somar
    // 12.000/mês para quem recebe 10.000.
    const valor = salaryOccurrenceAmount("BIWEEKLY", [
      em(2026, 8, 5, 6000), em(2026, 8, 20, 4000),
      em(2026, 9, 5, 6000), em(2026, 9, 20, 4000),
    ]);
    expect(valor).toBe(5000);
  });

  it("sem ocorrência, zero", () => {
    expect(salaryOccurrenceAmount("MONTHLY", [])).toBe(0);
  });
});
