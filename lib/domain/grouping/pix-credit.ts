import { Prisma } from "@prisma/client";

interface BaseTransaction {
  id: string;
  description: string;
  direction: string;
  amount: number | Prisma.Decimal;
  date: string | Date;
  displayTitle?: string;
  accountName?: string;
  categoryName?: string;
  merchantName?: string | null;
  logoUrl?: string | null;
}

/**
 * Detects and groups "Pix no Crédito" transactions.
 * 
 * Pattern:
 * 1. Outflow from Credit Card (Total value: Pix + Fees)
 * 2. Inflow to Account (Intermediate bridge)
 * 3. Outflow from Account (Final Pix payment)
 */
export function groupPixCreditTransactions<T extends BaseTransaction>(transactions: T[]) {
  const processedIds = new Set<string>();
  const results: Array<T | (T & Record<string, unknown>)> = [];

  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    if (processedIds.has(tx.id)) continue;

    const desc = (tx.description || '').toLowerCase();
    const isTrigger = desc.includes('valor adicionado para pix no credito') || 
                      desc.includes('valor adicionado na conta por cartao de credito');

    if (isTrigger && tx.direction === 'INFLOW') {
      // This is the bridge inflow (Line 2 in user example)
      // Look for the bridge outflow (Line 3) and the card debit (Line 1)
      const amountBridge = Math.abs(Number(tx.amount));
      const dateStr = new Date(tx.date).toISOString().split('T')[0];

      // Find the outflow from account with same amount
      const bridgeOutflow = sorted.find(t => 
        !processedIds.has(t.id) &&
        t.id !== tx.id &&
        Math.abs(Number(t.amount)) === amountBridge &&
        t.direction === 'OUTFLOW' &&
        new Date(t.date).toISOString().split('T')[0] === dateStr
      );

      // Find the card debit (usually slightly higher due to fees)
      const cardDebit = sorted.find(t => 
        !processedIds.has(t.id) &&
        t.id !== tx.id &&
        t.id !== bridgeOutflow?.id &&
        Number(t.amount) < 0 &&
        Math.abs(Number(t.amount)) >= amountBridge &&
        Math.abs(Number(t.amount)) <= amountBridge * 1.1 &&
        new Date(t.date).toISOString().split('T')[0] === dateStr
      );

      if (bridgeOutflow && cardDebit) {
        const totalAmount = Number(cardDebit.amount);
        const pixAmount = amountBridge;
        const feeAmount = Math.abs(totalAmount) - pixAmount;

        results.push({
          ...cardDebit,
          id: `group:pix_credit:${cardDebit.id}`,
          displayTitle: `PIX no Crédito → ${bridgeOutflow.displayTitle || bridgeOutflow.description}`,
          displaySubtitle: `${cardDebit.accountName} · Taxa: R$ ${feeAmount.toFixed(2)}`,
          isPixCreditGroup: true,
          pixAmount,
          feeAmount,
          originalTransactions: [cardDebit, tx, bridgeOutflow],
        });

        processedIds.add(tx.id);
        processedIds.add(bridgeOutflow.id);
        processedIds.add(cardDebit.id);
        continue;
      }
    }

    results.push(tx);
    processedIds.add(tx.id);
  }

  return results;
}
