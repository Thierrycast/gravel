import { prisma } from "@/lib/prisma";
import { DomainTransaction, DomainTransactionDirection } from "@prisma/client";

/**
 * Benford's Law check for transaction amounts.
 * Returns the distribution of the first digit (1-9).
 */
export async function checkBenfordsLaw() {
  const transactions = await prisma.domainTransaction.findMany({
    where: { direction: DomainTransactionDirection.OUTFLOW },
    select: { amount: true },
  });

  const counts = Array(10).fill(0);
  let total = 0;

  for (const tx of transactions) {
    const amountStr = Math.abs(Number(tx.amount))
      .toString()
      .replace(/[^1-9]/, "");
    if (amountStr.length > 0) {
      const firstDigit = parseInt(amountStr[0]);
      counts[firstDigit]++;
      total++;
    }
  }

  const distribution = counts.slice(1).map((count) => (count / total) * 100);
  // Standard Benford distribution: [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6]
  const ideal = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];

  return {
    actual: distribution,
    ideal,
    anomalies: distribution.map((value, index) => Math.abs(value - ideal[index]) > 5), // Simple threshold
  };
}

/**
 * Detects transactions that recur with exact periodicity but slightly different amounts.
 */
export async function detectHiddenSubscriptions() {
  const transactions = await prisma.domainTransaction.findMany({
    where: { direction: DomainTransactionDirection.OUTFLOW },
    orderBy: { occurredAt: "asc" },
  });

  const groups: Record<string, DomainTransaction[]> = {};

  // Group by merchant name or description (normalized)
  for (const tx of transactions) {
    const key = (tx.merchantName || tx.description || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const potentialSubs = [];

  for (const key in groups) {
    const txs = groups[key];
    if (txs.length < 3) continue;

    // Check for 30-31 day gaps
    let hits = 0;
    let totalGap = 0;
    for (let i = 1; i < txs.length; i++) {
      const gap =
        (txs[i].occurredAt.getTime() - txs[i - 1].occurredAt.getTime()) /
        (1000 * 60 * 60 * 24);
      if (gap >= 27 && gap <= 33) {
        hits++;
        totalGap += gap;
      }
    }

    if (hits >= 2) {
      const avgAmount =
        txs.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / txs.length;
      const variation = txs.some(
        (transaction) => Math.abs(Math.abs(Number(transaction.amount)) - avgAmount) > 0.01,
      );

      if (variation) {
        potentialSubs.push({
          name: txs[0].merchantName || txs[0].description,
          avgAmount,
          avgGap: totalGap / hits,
          occurrences: txs.length,
        });
      }
    }
  }

  return potentialSubs;
}
