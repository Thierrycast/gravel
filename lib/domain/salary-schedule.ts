/**
 * Com que frequência o salário cai — e quanto cai de cada vez.
 *
 * O motor assumia mensal e forçava a mão: reduzia o grupo à MAIOR entrada de
 * cada mês e cravava `detectedInterval = "MONTHLY"`. Quem recebe quinzenal, ou
 * adiantamento de 40% no dia 15 e 60% no dia 5, tinha o segundo pagamento
 * simplesmente descartado — e a projeção de caixa subestimava a receita todo
 * mês.
 *
 * O `largestByMonth` não era arbitrário: ele existia porque o padrão de salário
 * do usuário também casa transferências próprias pequenas, e sem filtro elas
 * bagunçavam a detecção de intervalo. Por isso a correção não é remover a
 * redução — é trocá-la por uma que separe "segundo pagamento" de "ruído":
 * ruído é uma entrada pequena perto da maior do mês; segundo pagamento é uma
 * entrada da mesma ordem de grandeza.
 */

export type SalaryOccurrence = {
  occurredAt: Date;
  /** Valor absoluto da entrada. */
  amount: number;
};

/**
 * Abaixo desta fração do maior valor do mês, a entrada é ruído e não pagamento.
 * 25% acomoda o adiantamento de 40/60 (0,67 do maior) com folga larga, e ainda
 * descarta a transferência de R$ 200 que casou o padrão por acidente.
 */
export const SALARY_NOISE_RATIO = 0.25;

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

/**
 * Remove o ruído de cada mês, preservando pagamentos de verdade.
 */
export function reduceSalaryOccurrences<T extends SalaryOccurrence>(
  occurrences: T[],
  noiseRatio: number = SALARY_NOISE_RATIO,
): T[] {
  const byMonth = new Map<string, T[]>();
  for (const occurrence of occurrences) {
    const key = monthKey(occurrence.occurredAt);
    byMonth.set(key, [...(byMonth.get(key) ?? []), occurrence]);
  }

  const kept: T[] = [];
  for (const monthOccurrences of byMonth.values()) {
    const largest = Math.max(...monthOccurrences.map((o) => Math.abs(o.amount)));
    const floor = largest * noiseRatio;
    for (const occurrence of monthOccurrences) {
      if (Math.abs(occurrence.amount) >= floor) kept.push(occurrence);
    }
  }

  return kept.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

export type SalaryInterval = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/**
 * Periodicidade a partir de quantos pagamentos caem por mês.
 *
 * Contar pagamentos por mês é mais robusto que medir o intervalo médio: quem
 * recebe no dia 15 e no dia 5 do mês seguinte tem intervalos de 20 e 10 dias
 * alternados, e a média dos dois (15) casaria quinzenal por acidente tanto
 * quanto casaria outra coisa. A contagem não se confunde.
 */
export function detectSalaryInterval(occurrences: SalaryOccurrence[]): SalaryInterval {
  const months = new Map<string, number>();
  for (const occurrence of occurrences) {
    const key = monthKey(occurrence.occurredAt);
    months.set(key, (months.get(key) ?? 0) + 1);
  }

  if (months.size === 0) return "MONTHLY";

  // Mediana, não média: um mês com 13º ou bônus não promove o ano inteiro a
  // quinzenal.
  const counts = [...months.values()].sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];

  if (median >= 4) return "WEEKLY";
  if (median >= 2) return "BIWEEKLY";
  return "MONTHLY";
}

/**
 * Valor de UM pagamento, para a regra recorrente.
 *
 * Mensal usa mediana — meses sem salário não puxam para baixo. Quinzenal e
 * semanal usam média, porque num 40/60 a mediana escolheria sempre a parcela
 * maior e a projeção sairia inflada: dois pagamentos de 60 em vez de 40 + 60.
 */
export function salaryOccurrenceAmount(
  interval: SalaryInterval,
  occurrences: SalaryOccurrence[],
) {
  const amounts = occurrences.map((occurrence) => Math.abs(occurrence.amount));
  if (amounts.length === 0) return 0;

  if (interval === "MONTHLY") {
    const sorted = [...amounts].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  return amounts.reduce((total, amount) => total + amount, 0) / amounts.length;
}
