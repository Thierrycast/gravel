import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Utilitários centrais de recorrências (receitas e despesas).
 *
 * Regras vivem em `DomainRecurringRule`; campos derivados (direção, próxima
 * ocorrência, origem) ficam em `metadataJson`. Origens:
 * - "detected": recriada a cada `refreshRecurringDerived` a partir do histórico;
 * - "manual": criada/editada pelo usuário, preservada nos refreshes;
 * - "dismissed": marcador de regra detectada que o usuário excluiu — impede a
 *   detecção de recriá-la (a linha fica inativa e oculta nas listagens).
 */

export const RECURRING_INTERVALS = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
] as const;

export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export const RECURRING_INTERVAL_LABEL: Record<RecurringInterval, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export function isRecurringInterval(
  value: string | null | undefined,
): value is RecurringInterval {
  return RECURRING_INTERVALS.includes(value as RecurringInterval);
}

/**
 * Valor mensal equivalente de uma regra — única forma correta de somar regras
 * de periodicidades diferentes em um total mensal.
 */
export function monthlyEquivalentAmount(
  amount: number,
  interval: string | null | undefined,
) {
  const value = Math.abs(amount);
  switch (interval) {
    case "WEEKLY":
      return (value * 52) / 12;
    case "BIWEEKLY":
      return (value * 26) / 12;
    case "QUARTERLY":
      return value / 3;
    case "YEARLY":
      return value / 12;
    case "MONTHLY":
    default:
      return value;
  }
}

function monthDelta(from: Date, to: Date) {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

function addMonthsClamped(date: Date, months: number) {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

/**
 * Datas de ocorrência da regra dentro de um mês. Respeita a periodicidade:
 * semanais podem ocorrer 4-5x, trimestrais/anuais só nos meses certos.
 */
export function occurrenceDatesInMonth(
  interval: string | null | undefined,
  nextDate: Date,
  monthStart: Date,
  monthEnd: Date,
): Date[] {
  if (monthEnd < nextDate && monthDelta(nextDate, monthStart) < 0) return [];

  switch (interval) {
    case "WEEKLY":
    case "BIWEEKLY": {
      const stepDays = interval === "WEEKLY" ? 7 : 14;
      const stepMs = stepDays * MS_IN_DAY;
      let cursorMs = nextDate.getTime();
      if (cursorMs < monthStart.getTime()) {
        const stepsBehind = Math.ceil(
          (monthStart.getTime() - cursorMs) / stepMs,
        );
        cursorMs += stepsBehind * stepMs;
      }
      const dates: Date[] = [];
      while (cursorMs <= monthEnd.getTime()) {
        dates.push(new Date(cursorMs));
        cursorMs += stepMs;
      }
      return dates;
    }
    case "QUARTERLY":
    case "YEARLY": {
      const period = interval === "QUARTERLY" ? 3 : 12;
      const delta = monthDelta(nextDate, monthStart);
      if (delta < 0 || delta % period !== 0) return [];
      const occurrence = addMonthsClamped(nextDate, delta);
      return occurrence >= monthStart && occurrence <= monthEnd
        ? [occurrence]
        : [];
    }
    case "MONTHLY":
    default: {
      const delta = monthDelta(nextDate, monthStart);
      if (delta < 0) return [];
      const occurrence = addMonthsClamped(nextDate, delta);
      return occurrence >= monthStart && occurrence <= monthEnd
        ? [occurrence]
        : [];
    }
  }
}

type RuleMetadata = {
  origin?: string;
  direction?: string;
  nextDate?: string;
  confidence?: number;
  accountId?: string | null;
  occurrences?: number;
  lastOccurrenceAt?: string | null;
  sourceTransactionIds?: string[];
  isInstallment?: boolean;
};

function parseRuleMetadata(value?: string | null): RuleMetadata {
  if (!value) return {};
  try {
    return JSON.parse(value) as RuleMetadata;
  } catch {
    return {};
  }
}

export type ManualRecurringInput = {
  name: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  interval: RecurringInterval;
  nextDate: Date;
  categoryId?: string | null;
};

export function validateManualRecurringInput(body: unknown): {
  ok: true;
  input: ManualRecurringInput;
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corpo da requisição inválido" };
  }
  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return { ok: false, error: "Informe um nome para a recorrência" };

  const amount = Number(record.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Informe um valor maior que zero" };
  }

  const type = record.type === "INCOME" ? "INCOME" : record.type === "EXPENSE" ? "EXPENSE" : null;
  if (!type) return { ok: false, error: "Tipo deve ser INCOME ou EXPENSE" };

  const interval = isRecurringInterval(record.interval as string)
    ? (record.interval as RecurringInterval)
    : null;
  if (!interval) {
    return {
      ok: false,
      error: `Periodicidade deve ser uma de: ${RECURRING_INTERVALS.join(", ")}`,
    };
  }

  const nextDate = record.nextDate ? new Date(String(record.nextDate)) : null;
  if (!nextDate || Number.isNaN(nextDate.getTime())) {
    return { ok: false, error: "Informe a data da próxima ocorrência" };
  }

  return {
    ok: true,
    input: {
      name,
      amount: Math.round(amount * 100) / 100,
      type,
      interval,
      nextDate,
      categoryId:
        typeof record.categoryId === "string" && record.categoryId
          ? record.categoryId
          : null,
    },
  };
}

export async function createManualRecurringRule(input: ManualRecurringInput) {
  return prisma.domainRecurringRule.create({
    data: {
      name: input.name,
      amount: new Prisma.Decimal(input.amount),
      interval: input.interval,
      categoryId: input.categoryId ?? undefined,
      active: true,
      metadataJson: JSON.stringify({
        origin: "manual",
        direction: input.type,
        nextDate: input.nextDate.toISOString(),
      }),
    },
  });
}

export async function updateRecurringRule(
  id: string,
  input: Partial<ManualRecurringInput> & { active?: boolean },
) {
  const existing = await prisma.domainRecurringRule.findUnique({
    where: { id },
  });
  if (!existing) return null;

  const metadata = parseRuleMetadata(existing.metadataJson);
  // Editar uma regra detectada a converte em manual: o usuário assumiu o
  // controle e os refreshes de detecção não devem mais sobrescrevê-la.
  const nextMetadata: RuleMetadata = {
    ...metadata,
    origin: "manual",
    direction: input.type ?? metadata.direction,
    nextDate: input.nextDate
      ? input.nextDate.toISOString()
      : metadata.nextDate,
  };

  return prisma.domainRecurringRule.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      amount:
        input.amount !== undefined
          ? new Prisma.Decimal(input.amount)
          : existing.amount,
      interval: input.interval ?? existing.interval,
      categoryId:
        input.categoryId !== undefined
          ? (input.categoryId ?? null)
          : existing.categoryId,
      active: input.active ?? existing.active,
      metadataJson: JSON.stringify(nextMetadata),
    },
  });
}

/**
 * Exclui uma regra. Detectadas viram marcador "dismissed" (inativo) para a
 * detecção não recriá-las; manuais são removidas de fato.
 */
export async function deleteRecurringRule(id: string) {
  const existing = await prisma.domainRecurringRule.findUnique({
    where: { id },
  });
  if (!existing) return false;

  const metadata = parseRuleMetadata(existing.metadataJson);
  if (metadata.origin === "manual" || !metadata.origin) {
    await prisma.domainRecurringRule.delete({ where: { id } });
    return true;
  }

  await prisma.domainRecurringRule.update({
    where: { id },
    data: {
      active: false,
      metadataJson: JSON.stringify({ ...metadata, origin: "dismissed" }),
    },
  });
  return true;
}

/**
 * Chaves de comparação para evitar que a detecção recrie regras que o usuário
 * já gerencia manualmente ou descartou.
 */
export function ruleSuppressionKeys(rule: {
  merchantId?: string | null;
  descriptionPattern?: string | null;
  metadataJson?: string | null;
}) {
  const metadata = parseRuleMetadata(rule.metadataJson);
  const direction = metadata.direction ?? "";
  const keys: string[] = [];
  if (rule.merchantId) keys.push(`merchant:${direction}:${rule.merchantId}`);
  if (rule.descriptionPattern)
    keys.push(`pattern:${direction}:${rule.descriptionPattern.toLowerCase()}`);
  return keys;
}
