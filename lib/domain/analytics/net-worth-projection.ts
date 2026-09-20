import { Prisma } from "@prisma/client";

import { decimal } from "@/lib/domain/currency";

/**
 * Projeção de patrimônio líquido para os próximos meses, com e sem cenários.
 *
 * O bug que isto corrige: a linha do cenário era reatribuída à linha base a
 * cada iteração (`scenarioNW = projectedNW`), então um evento só mexia no mês
 * em que acontecia. Uma entrada de R$ 10.000 em março aparecia em março e
 * desaparecia em abril — a projeção voltava à base como se o dinheiro tivesse
 * evaporado. Cenário que não acumula não é cenário; é um pico no gráfico.
 */

export type ScenarioEvent = {
  /** Data do evento. Aceita string porque vem do banco como texto. */
  date: string | Date;
  amount: Prisma.Decimal | number | null;
};

export type NetWorthProjectionInput = {
  currentNetWorth: Prisma.Decimal;
  monthlySalary: number;
  includeSalary: boolean;
  scenarios: ScenarioEvent[];
  lookaheadMonths?: number;
  now?: Date;
};

export type ProjectedMonth = {
  date: Date;
  /** Linha base: só o salário recorrente. */
  netWorth: Prisma.Decimal;
  /** Linha do cenário: base + todos os eventos até aqui, acumulados. */
  scenarioNetWorth: Prisma.Decimal;
};

export function projectNetWorth({
  currentNetWorth,
  monthlySalary,
  includeSalary,
  scenarios,
  lookaheadMonths = 12,
  now = new Date(),
}: NetWorthProjectionInput): ProjectedMonth[] {
  const salary = new Prisma.Decimal(monthlySalary);
  const points: ProjectedMonth[] = [];

  let projectedNW = currentNetWorth;
  let scenarioNW = currentNetWorth;

  for (let month = 1; month <= lookaheadMonths; month += 1) {
    const projDate = new Date(now.getFullYear(), now.getMonth() + month, 1);
    const monthStart = new Date(projDate.getFullYear(), projDate.getMonth(), 1);
    const monthEnd = new Date(
      projDate.getFullYear(),
      projDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    if (includeSalary) {
      // O salário entra nas DUAS linhas. Antes ele só entrava na base, e a
      // linha do cenário o herdava pela reatribuição — que era justamente o
      // que apagava os eventos anteriores.
      projectedNW = projectedNW.plus(salary);
      scenarioNW = scenarioNW.plus(salary);
    }

    for (const scenario of scenarios) {
      const date = scenario.date instanceof Date ? scenario.date : new Date(scenario.date);
      if (Number.isNaN(date.getTime())) continue;
      if (date < monthStart || date > monthEnd) continue;
      scenarioNW = scenarioNW.plus(decimal(toDecimal(scenario.amount)));
    }

    points.push({ date: projDate, netWorth: projectedNW, scenarioNetWorth: scenarioNW });
  }

  return points;
}

function toDecimal(value: Prisma.Decimal | number | null) {
  if (value === null || value === undefined) return null;
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}
