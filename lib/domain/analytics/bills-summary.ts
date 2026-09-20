import { Prisma } from "@prisma/client";

import { createBrlConverter, decimal } from "@/lib/domain/currency";

import { normalizeBillStatus, startOfLocalDay } from "./shared";

/**
 * Resumo de faturas — a matemática, sem banco.
 *
 * Dois erros moravam aqui dentro de `getBillsSummaryMetrics`:
 *
 * 1. **Câmbio nenhum.** Os totais somavam `totalAmount` cru, enquanto o resto
 *    do overview convertia. Uma fatura de US$ 100 entrava no mesmo balde que
 *    R$ 100.
 * 2. **A fatura de hoje sumia.** Os recortes de 7 e 30 dias filtravam por
 *    `dueDate >= now`, com `now` carregando a hora corrente. Uma fatura que
 *    vence hoje tem carimbo 00:00 e ficava atrás da comparação — justamente a
 *    que mais importa. Duas linhas acima, `upcoming` já usava
 *    `startOfLocalDay`; era inconsistência dentro da mesma função.
 */

export type SummarizableBill = {
  id: string;
  status: string | null;
  dueDate: Date | null;
  totalAmount: Prisma.Decimal | null;
  minimumPaymentAmount: Prisma.Decimal | null;
  currencyCode: string | null;
};

const ZERO = new Prisma.Decimal(0);
const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeBills<T extends SummarizableBill>(
  bills: T[],
  now: Date,
  usdBrlRate: number | Prisma.Decimal,
  limit: number,
) {
  const toBrl = createBrlConverter(usdBrlRate);

  // O dia de hoje começa à meia-noite. Comparar com o instante atual é o que
  // excluía a fatura de hoje.
  const today = startOfLocalDay(now);
  const dueIn7 = new Date(today.getTime() + 7 * DAY_MS);
  const dueIn30 = new Date(today.getTime() + 30 * DAY_MS);

  const rows = bills.map((bill) => ({
    bill,
    status: normalizeBillStatus(bill.status, bill.dueDate, bill.totalAmount, now),
    totalBrl: toBrl(decimal(bill.totalAmount), bill.currencyCode),
    minimumBrl: toBrl(decimal(bill.minimumPaymentAmount), bill.currencyCode),
  }));

  const sum = (selected: typeof rows) =>
    selected.reduce((total, row) => total.plus(row.totalBrl), ZERO);

  const open = rows.filter((row) => row.status === "OPEN");
  const overdue = rows.filter((row) => row.status === "OVERDUE");
  const paid = rows.filter((row) => row.status === "PAID" || row.status === "CLOSED");

  /** Aberta, com data, vencendo entre hoje (inclusive) e o limite. */
  const dueWithin = (limitDate: Date) =>
    rows.filter(
      (row) =>
        row.status === "OPEN" &&
        row.bill.dueDate &&
        startOfLocalDay(row.bill.dueDate) >= today &&
        startOfLocalDay(row.bill.dueDate) <= limitDate,
    );

  const upcoming = rows
    .filter(
      (row) =>
        row.status === "OPEN" &&
        row.bill.dueDate &&
        startOfLocalDay(row.bill.dueDate) >= today,
    )
    .slice(0, limit)
    .map((row) => ({ ...row.bill, status: row.status }));

  return {
    totalAmount: sum(rows),
    minimumPayment: rows.reduce((total, row) => total.plus(row.minimumBrl), ZERO),
    openAmount: sum(open),
    paidAmount: sum(paid),
    overdueAmount: sum(overdue),
    dueIn7DaysAmount: sum(dueWithin(dueIn7)),
    dueIn30DaysAmount: sum(dueWithin(dueIn30)),
    counts: {
      bills: rows.length,
      open: open.length,
      overdue: overdue.length,
      paid: paid.length,
    },
    upcoming,
    /** Moedas que não soubemos converter — a UI avisa em vez de mentir. */
    unsupportedCurrencies: [...toBrl.unsupportedCurrencies].sort(),
  };
}
