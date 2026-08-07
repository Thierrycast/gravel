/**
 * Decisão pura de qual janela pedir ao `GET /v2/transactions`.
 *
 * A API não aceita `createdAtFrom` junto com `dateFrom` — este módulo é o único
 * lugar que escolhe entre os dois, e é testável sem banco.
 */

/**
 * Sobreposição aplicada ao ler a partir do checkpoint. A Pluggy grava
 * `createdAt` com o relógio dela; reler uma janela extra custa pouco (os
 * upserts são idempotentes) e evita buraco por diferença de relógio ou por
 * transação criada no meio de um sync anterior.
 */
export const CHECKPOINT_OVERLAP_MS = 24 * 60 * 60 * 1000

/** Limite de histórico que a Pluggy mantém. */
export const MAX_HISTORY_DAYS = 365

export type TransactionWindowMode =
  | "explicit-createdAtFrom"
  | "incremental"
  | "backfill"
  | "window"

export type TransactionWindow = {
  mode: TransactionWindowMode
  createdAtFrom?: string
  dateFrom?: string
}

function daysAgoIsoDate(days: number, now: number) {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Escolhe a janela de leitura:
 *
 * - `createdAtFrom` explícito (webhook `transactions/created`) manda em tudo;
 * - `full` força backfill de 12 meses por data de lançamento;
 * - com checkpoint, incremental por `createdAtFrom = watermark − sobreposição`;
 * - sem checkpoint, janela por `dateFrom` de `lookbackDays` (config do usuário).
 */
export function resolveTransactionWindow(input: {
  createdAtFrom?: string | null
  full?: boolean
  watermark?: Date | null
  lookbackDays?: number
  now?: number
}): TransactionWindow {
  const now = input.now ?? Date.now()

  if (input.createdAtFrom) {
    return { mode: "explicit-createdAtFrom", createdAtFrom: input.createdAtFrom }
  }

  if (input.full) {
    return { mode: "backfill", dateFrom: daysAgoIsoDate(MAX_HISTORY_DAYS, now) }
  }

  if (input.watermark) {
    return {
      mode: "incremental",
      createdAtFrom: new Date(
        input.watermark.getTime() - CHECKPOINT_OVERLAP_MS,
      ).toISOString(),
    }
  }

  return {
    mode: "window",
    dateFrom: daysAgoIsoDate(input.lookbackDays ?? MAX_HISTORY_DAYS, now),
  }
}
