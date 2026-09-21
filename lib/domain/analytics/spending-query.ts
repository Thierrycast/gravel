import { DomainTransactionDirection, Prisma } from "@prisma/client";

import {
  classifyCashFlowTransaction,
  detectInternalTransferPairIds,
} from "./shared";

/**
 * Filtro de gasto operacional — o mesmo que o fluxo de caixa usa.
 *
 * Existe porque o motor de Inbox/notificações rodava Prisma puro: pedia
 * `{ direction: "OUTFLOW", ignored: false }` e somava. Sem as exclusões de
 * `shared.ts`, toda transferência entre contas do próprio usuário virava gasto
 * da categoria "Transferências" — e estourava o orçamento dela todo mês, com
 * push, Telegram e ntfy junto. O mesmo buraco marcava um Pix de R$ 3.000
 * entre contas próprias como "possível salário" na Inbox.
 *
 * A regra de negócio de "o que conta como gasto" tem que existir num lugar só.
 * Este módulo é a ponte: a consulta continua no chamador, a política vem daqui.
 */

/** Campos mínimos para classificar. Menos que isto e a política erra. */
export const SPENDING_TRANSACTION_SELECT = {
  id: true,
  amount: true,
  direction: true,
  occurredAt: true,
  description: true,
  normalizedDescription: true,
  domainCategoryId: true,
  domainAccountId: true,
  domainCategory: { select: { name: true, kind: true } },
  domainMerchant: { select: { displayName: true } },
  // `satisfies` em vez de `as const`: o readonly que o `as const` produz não é
  // aceito pelo tipo de select do Prisma.
} satisfies Prisma.DomainTransactionSelect;

export type ClassifiableTransaction = {
  id: string;
  amount: Prisma.Decimal;
  direction: DomainTransactionDirection | string;
  occurredAt: Date;
  description?: string | null;
  normalizedDescription?: string | null;
  domainCategoryId?: string | null;
  domainAccountId?: string | null;
  domainCategory?: { name: string | null; kind: string | null } | null;
  domainMerchant?: { displayName: string | null } | null;
};

export type SpendingFilterOptions = {
  salaryPatterns?: string[];
  /** Janela para casar as duas pontas de uma transferência interna. */
  transferWindowMs?: number;
};

/**
 * Núcleo: pareia transferências internas e classifica cada transação com a
 * política do fluxo de caixa, devolvendo só a classificação pedida.
 */
function filterByClassification<T extends ClassifiableTransaction>(
  transactions: T[],
  wanted: "expense" | "income",
  options?: SpendingFilterOptions,
): T[] {
  const internalTransferPairIds = detectInternalTransferPairIds(
    transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      direction: transaction.direction,
      occurredAt: transaction.occurredAt,
      description: transaction.description ?? null,
      normalizedDescription: transaction.normalizedDescription ?? null,
      merchantName: transaction.domainMerchant?.displayName ?? null,
      domainAccountId: transaction.domainAccountId ?? null,
    })),
    options?.transferWindowMs ? { windowMs: options.transferWindowMs } : undefined,
  );

  return transactions.filter((transaction) => {
    if (internalTransferPairIds.has(transaction.id)) return false;

    const classification = classifyCashFlowTransaction(
      transaction.direction,
      transaction.domainCategory?.name,
      transaction.domainCategory?.kind,
      transaction.description ?? transaction.normalizedDescription,
      {
        salaryPatterns: options?.salaryPatterns,
        merchantName: transaction.domainMerchant?.displayName ?? null,
      },
    );

    return classification === wanted;
  });
}

/**
 * Devolve só o que é gasto operacional de verdade: fora transferência entre
 * contas próprias, pagamento de fatura, aporte e resgate.
 */
export function filterOperationalSpending<T extends ClassifiableTransaction>(
  transactions: T[],
  options?: SpendingFilterOptions,
): T[] {
  return filterByClassification(transactions, "expense", options);
}

/**
 * Entradas que são receita de verdade — mesma política, outro lado.
 *
 * É o que faltava em `getInboxPayload`: um Pix recebido de conta própria
 * passava no teste de "entrada acima de R$ 200" e virava candidato a salário.
 */
export function filterOperationalIncome<T extends ClassifiableTransaction>(
  transactions: T[],
  options?: SpendingFilterOptions,
): T[] {
  return filterByClassification(transactions, "income", options);
}
