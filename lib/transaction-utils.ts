import type { Transaction } from "@/lib/types/api";

export function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeDirection(
  value: string | null,
): "INFLOW" | "OUTFLOW" | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "INFLOW" || normalized === "INCOME") return "INFLOW";
  if (normalized === "OUTFLOW" || normalized === "EXPENSE") return "OUTFLOW";
  return undefined;
}

export function installmentLabel(transaction: Transaction): string | null {
  if (!transaction.installmentNumber || !transaction.installmentTotal) {
    return null;
  }
  return `${transaction.installmentNumber}/${transaction.installmentTotal}`;
}
