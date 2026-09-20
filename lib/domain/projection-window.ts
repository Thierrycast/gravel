import { PROJECTION } from "./constants";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const DAYS_IN_MONTH = 30;

/**
 * Por quantos meses dividir o gasto variável acumulado.
 *
 * O divisor era `3`, fixo, porque a janela de apuração é de 90 dias. Só que
 * isso pressupõe que o usuário TEM 90 dias de histórico. Quem acabou de
 * conectar a conta e tem um mês de extrato via o gasto variável projetado pela
 * terça parte do real — a projeção mentia para baixo justamente para quem tem
 * menos base para desconfiar dela.
 *
 * Agora o divisor é o período que de fato existe, limitado pela janela e nunca
 * menor que 1 (menos de um mês de histórico não vira multiplicação).
 */
export function variableExpenseDivisor(
  earliestTransactionAt: Date | null | undefined,
  now: Date = new Date(),
  lookbackDays: number = PROJECTION.VARIABLE_EXPENSE_LOOKBACK_DAYS,
) {
  const lookbackMonths = lookbackDays / DAYS_IN_MONTH;

  // Sem histórico o total também é zero; o divisor não muda resultado nenhum,
  // mas devolver a janela cheia mantém a divisão definida.
  if (!earliestTransactionAt) return lookbackMonths;

  const spanDays = (now.getTime() - earliestTransactionAt.getTime()) / MS_IN_DAY;
  if (!Number.isFinite(spanDays)) return lookbackMonths;

  const spanMonths = spanDays / DAYS_IN_MONTH;
  return Math.min(lookbackMonths, Math.max(1, spanMonths));
}
