/**
 * Formato que os quatro gráficos de fluxo de caixa consomem: a linha crua da
 * API (`/api/domain/metrics/cash-flow`) mais o `label` já formatado para o eixo
 * X. O cálculo continua na página — aqui só declaramos o contrato para que os
 * gráficos não precisem conhecer o shape da resposta HTTP.
 */
export interface CashFlowChartDatum {
  date: string;
  income: number;
  expense: number;
  investments: number;
  net: number;
  label: string;
}
