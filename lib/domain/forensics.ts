import type { DomainTransaction } from "@prisma/client";
import { DomainTransactionDirection } from "@prisma/client";
import { SUBSCRIPTION_DETECTION } from "@/lib/domain/constants";

export const BENFORD_IDEAL = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
const ANOMALY_THRESHOLD = SUBSCRIPTION_DETECTION.BENFORD_ANOMALY_THRESHOLD;

type AmountInput = number | string | { toString(): string } | null | undefined;

function leadingDigit(amount: AmountInput): number | null {
  if (amount == null) return null;
  const num = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(num) || num === 0) return null;
  // Strip non-1-9 chars from absolute value's string form (handles "0.0123").
  const stripped = Math.abs(num)
    .toString()
    .replace(/[^1-9]/g, "");
  if (stripped.length === 0) return null;
  const digit = parseInt(stripped[0], 10);
  return digit >= 1 && digit <= 9 ? digit : null;
}

/**
 * Pure: compute Benford distribution from a list of amounts.
 * Returns percentages for digits 1-9 plus anomaly flags.
 */
export function computeBenfordDistribution(amounts: AmountInput[]) {
  const counts = Array(10).fill(0);
  let total = 0;

  for (const amount of amounts) {
    const digit = leadingDigit(amount);
    if (digit !== null) {
      counts[digit]++;
      total++;
    }
  }

  const distribution =
    total > 0
      ? counts.slice(1).map((count) => (count / total) * 100)
      : Array(9).fill(0);

  return {
    actual: distribution,
    ideal: BENFORD_IDEAL,
    anomalies: distribution.map(
      (value, index) =>
        Math.abs(value - BENFORD_IDEAL[index]) > ANOMALY_THRESHOLD,
    ),
    sampleSize: total,
  };
}

/**
 * Benford's Law check for transaction amounts.
 * Returns the distribution of the first digit (1-9).
 */
export async function checkBenfordsLaw() {
  const { prisma } = await import("@/lib/prisma");
  const transactions = await prisma.domainTransaction.findMany({
    where: { direction: DomainTransactionDirection.OUTFLOW },
    select: { amount: true },
  });

  return computeBenfordDistribution(transactions.map((tx) => tx.amount));
}

type SubscriptionCandidate = Pick<
  DomainTransaction,
  "occurredAt" | "amount" | "merchantName" | "description"
>;

const NON_SUBSCRIPTION_DESCRIPTIONS = [
  /\bpix\s+enviad[oa]\b/,
  /\btransferencia\s+(?:enviada|realizada|pix|para)\b/,
  /\bpagamento\s+(?:de\s+)?fatura\b/,
  /\bfatura\s+(?:do\s+)?cartao\b/,
];

function normalizeSubscriptionText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isKnownNonSubscription(transaction: SubscriptionCandidate) {
  const description = normalizeSubscriptionText(
    `${transaction.merchantName ?? ""} ${transaction.description ?? ""}`,
  );
  return NON_SUBSCRIPTION_DESCRIPTIONS.some((pattern) =>
    pattern.test(description),
  );
}

export type HiddenSubscription = {
  name: string | null;
  avgAmount: number;
  avgGap: number;
  occurrences: number;
};

/**
 * Pure: scan grouped transactions for monthly recurrence with amount drift.
 */
export function findHiddenSubscriptions(
  transactions: SubscriptionCandidate[],
): HiddenSubscription[] {
  const groups: Record<string, SubscriptionCandidate[]> = {};

  for (const tx of transactions) {
    if (isKnownNonSubscription(tx)) continue;
    const key = (tx.merchantName || tx.description || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const potentialSubs: HiddenSubscription[] = [];

  for (const key in groups) {
    const txs = [...groups[key]].sort(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    if (txs.length < SUBSCRIPTION_DETECTION.MIN_OCCURRENCES) continue;

    let hits = 0;
    let totalGap = 0;
    for (let i = 1; i < txs.length; i++) {
      const gap =
        (txs[i].occurredAt.getTime() - txs[i - 1].occurredAt.getTime()) /
        (1000 * 60 * 60 * 24);
      if (
        gap >= SUBSCRIPTION_DETECTION.MONTHLY_INTERVAL_MIN_DAYS &&
        gap <= SUBSCRIPTION_DETECTION.MONTHLY_INTERVAL_MAX_DAYS
      ) {
        hits++;
        totalGap += gap;
      }
    }

    if (hits < SUBSCRIPTION_DETECTION.MIN_HITS) continue;

    const avgAmount =
      txs.reduce(
        (sum, transaction) => sum + Math.abs(Number(transaction.amount)),
        0,
      ) / txs.length;
    const variation = txs.some(
      (transaction) =>
        Math.abs(Math.abs(Number(transaction.amount)) - avgAmount) > 0.01,
    );

    if (!variation) continue;

    potentialSubs.push({
      name: txs[0].merchantName || txs[0].description,
      avgAmount,
      avgGap: totalGap / hits,
      occurrences: txs.length,
    });
  }

  return potentialSubs;
}

/**
 * Detects transactions that recur with exact periodicity but slightly different amounts.
 */
export async function detectHiddenSubscriptions() {
  const { prisma } = await import("@/lib/prisma");
  const transactions = await prisma.domainTransaction.findMany({
    where: {
      direction: DomainTransactionDirection.OUTFLOW,
      ignored: false,
    },
    include: {
      domainCategory: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  const candidates = transactions.filter(
    (tx) => tx.domainCategory?.kind !== "TRANSFER",
  );

  return findHiddenSubscriptions(candidates);
}
