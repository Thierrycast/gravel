import { DomainAccountKind, Prisma } from "@prisma/client";

import { createBrlConverter, decimal } from "@/lib/domain/currency";

/**
 * Alocação por conta — a matemática, sem banco.
 *
 * Estava embutida em `getAccountAllocationMetrics`, junto com a consulta ao
 * Prisma, e por isso nunca teve teste. Dois erros moravam aí:
 *
 * 1. `assetsTotal` somava toda conta com saldo positivo. A Pluggy modela a
 *    **dívida** do cartão como saldo positivo, então a fatura entrava no
 *    patrimônio como se fosse dinheiro — e ainda diluía o `sharePercent` de
 *    todas as outras contas.
 * 2. A conversão comparava `normalizeCurrencyCode(...) === "USD"`, e
 *    `normalizeCurrencyCode` devolve "USDT" inalterado. Stablecoin passava
 *    sem conversão: 1000 USDT somavam como 1000 BRL.
 */

/**
 * O que conta como crédito (saldo positivo = dívida).
 *
 * Definição única. Antes havia duas no mesmo arquivo: um `Set` tipado com
 * `CARD` e outro com as strings `["CARD", "CREDIT"]` — e `CREDIT` não existe
 * em `DomainAccountKind`, então aquela metade nunca casou com nada.
 */
export const CREDIT_ACCOUNT_KINDS: ReadonlySet<DomainAccountKind> = new Set([
  DomainAccountKind.CARD,
]);

export function isCreditAccountKind(kind: DomainAccountKind) {
  return CREDIT_ACCOUNT_KINDS.has(kind);
}

export type AllocationAccount = {
  id: string;
  name: string;
  kind: DomainAccountKind;
  balance: Prisma.Decimal | null;
  currencyCode: string | null;
  institutionName: string | null;
  sourceProvider: string;
};

const ZERO = new Prisma.Decimal(0);

function percentOf(part: Prisma.Decimal, whole: Prisma.Decimal) {
  if (whole.isZero()) return ZERO;
  return part.div(whole).mul(100);
}

export function summarizeAccountAllocation(
  accounts: AllocationAccount[],
  usdBrlRate: number | Prisma.Decimal,
  limit: number,
) {
  const toBrl = createBrlConverter(usdBrlRate);

  // Saldo de cada conta já em BRL, com o sinal certo: crédito é passivo.
  const rows = accounts.map((account) => {
    const balanceBrl = toBrl(decimal(account.balance), account.currencyCode);
    const isCredit = isCreditAccountKind(account.kind);
    return {
      account,
      balanceBrl,
      isCredit,
      /** Contribuição para o patrimônio: dívida entra negativa. */
      netContribution: isCredit ? balanceBrl.abs().mul(-1) : balanceBrl,
      /** Contribuição para os ativos: só saldo positivo que não seja dívida. */
      assetContribution: !isCredit && balanceBrl.greaterThan(0) ? balanceBrl : ZERO,
    };
  });

  const netWorth = rows.reduce((total, row) => total.plus(row.netContribution), ZERO);
  const assetsTotal = rows.reduce((total, row) => total.plus(row.assetContribution), ZERO);

  const byAccount = rows.slice(0, limit).map((row) => ({
    id: row.account.id,
    name: row.account.name,
    kind: row.account.kind,
    institutionName: row.account.institutionName,
    sourceProvider: row.account.sourceProvider,
    balance: decimal(row.account.balance),
    sharePercent: percentOf(row.balanceBrl.abs(), assetsTotal),
  }));

  const byKindMap = new Map<DomainAccountKind, Prisma.Decimal>();
  for (const row of rows) {
    const current = byKindMap.get(row.account.kind) ?? ZERO;
    byKindMap.set(row.account.kind, current.plus(row.netContribution));
  }

  const byKind = [...byKindMap.entries()]
    .map(([kind, balance]) => ({
      kind,
      balance,
      sharePercent: percentOf(balance.abs(), assetsTotal),
    }))
    .sort((left, right) => right.balance.comparedTo(left.balance));

  return {
    netWorth,
    assetsTotal,
    byAccount,
    byKind,
    /** Contas que de fato somam em ativos (exclui crédito e saldo negativo). */
    assetAccountCount: rows.filter((row) => !row.assetContribution.isZero()).length,
    /** Moedas que não soubemos converter — a UI deve avisar em vez de mentir. */
    unsupportedCurrencies: [...toBrl.unsupportedCurrencies].sort(),
  };
}
