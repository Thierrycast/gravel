const currencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const currencyCompactFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

const numberFmt = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
})

const percentFmt = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
})

const dateFullFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

const monthFmt = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
})

/**
 * Format an unsigned currency value as BRL.
 * Use this when the sign is conveyed by context (e.g. an "expenses" card).
 */
export function formatCurrency(value: number | null | undefined): string {
  const num = value ?? 0
  // Sanitize negative zero (IEEE 754 -0) to avoid displaying "-R$ 0,00"
  return currencyFmt.format(num === 0 ? 0 : num)
}

export function formatCurrencyByCode(
  value: number | null | undefined,
  currencyCode?: string | null
): string {
  const num = value ?? 0
  const code = currencyCode?.trim().toUpperCase() || "BRL"
  const normalizedCode =
    code === "R$" || code === "REAL" || code === "REAIS"
      ? "BRL"
      : code === "DOLAR" || code === "DOLLAR"
        ? "USD"
        : code

  try {
    return new Intl.NumberFormat(normalizedCode === "USD" ? "en-US" : "pt-BR", {
      style: "currency",
      currency: normalizedCode,
    }).format(num === 0 ? 0 : num)
  } catch {
    return `${normalizedCode} ${numberFmt.format(num === 0 ? 0 : num)}`
  }
}

/**
 * Format a currency value with an explicit sign and absolute amount.
 * Negative numbers render as "−R$ 1.234,56", positives as "R$ 1.234,56".
 * Use the `mode` parameter to control how positive values render:
 *  - `"none"`   (default): no leading "+"
 *  - `"always"`: always render "+" for positives — useful for deltas/PnL
 *  - `"signed"`: render "+" for positives only when the magnitude is non-zero
 */
export function formatSignedCurrency(
  value: number | null | undefined,
  mode: "none" | "always" | "signed" = "none"
): string {
  const raw = value ?? 0
  // Sanitize negative zero
  const num = raw === 0 ? 0 : raw
  const formatted = currencyFmt.format(Math.abs(num))
  if (num < 0) return `−${formatted}`
  if ((mode === "always" || (mode === "signed" && num !== 0)) && num > 0) {
    return `+${formatted}`
  }
  return formatted
}

/**
 * Format a credit/debit value where positive = income/credit and
 * negative = expense/debit. Always emits a sign so the polarity is unambiguous.
 */
export function formatDelta(value: number | null | undefined): string {
  return formatSignedCurrency(value, "always")
}

/** Compact form, e.g. "R$ 1,2 mil". Always positive (sign by context). */
export function formatCurrencyCompact(value: number | null | undefined): string {
  return currencyCompactFmt.format(value ?? 0)
}

/** Smart compact: full notation under 100k, compact above. */
export function formatCurrencySmart(value: number | null | undefined): string {
  const num = value ?? 0
  if (Math.abs(num) >= 100_000) return currencyCompactFmt.format(num)
  return currencyFmt.format(num)
}

export function formatNumber(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0)
}

/** A percent given as 0–100 (not 0–1). */
export function formatPercent(value: number | null | undefined): string {
  return percentFmt.format((value ?? 0) / 100)
}

/** A signed percent given as 0–100. */
export function formatSignedPercent(value: number | null | undefined): string {
  const num = value ?? 0
  const out = percentFmt.format(Math.abs(num) / 100)
  if (num > 0) return `+${out}`
  if (num < 0) return `−${out}`
  return out
}

function toValidDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(date: string | Date | null | undefined): string {
  const parsed = toValidDate(date)
  if (!parsed) return "Sem data"
  return dateFmt.format(parsed)
}

export function formatDateFull(date: string | Date | null | undefined): string {
  const parsed = toValidDate(date)
  if (!parsed) return "Sem data"
  return dateFullFmt.format(parsed)
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const parsed = toValidDate(date)
  if (!parsed) return "Sem data"
  return dateTimeFmt.format(parsed)
}

export function formatMonth(date: string | Date | null | undefined): string {
  const parsed = toValidDate(date)
  if (!parsed) return "Sem data"
  return monthFmt.format(parsed)
}

export function daysUntil(date: string | Date | null | undefined): number {
  const target = toValidDate(date)
  if (!target) return Number.NaN
  const now = new Date()
  target.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function daysUntilLabel(date: string | Date | null | undefined): string {
  const days = daysUntil(date)
  if (!Number.isFinite(days)) return "Sem data"
  if (days === 0) return "Hoje"
  if (days === 1) return "Amanhã"
  if (days === -1) return "Ontem"
  if (days < 0) return `${Math.abs(days)} dias atrás`
  return `Em ${days} dias`
}

/**
 * Sign-aware Tailwind class helpers — keep colour application consistent.
 */
export function amountToneClass(
  value: number | null | undefined,
  options?: { neutralOnZero?: boolean; reverse?: boolean }
): string {
  const num = value ?? 0
  if (options?.neutralOnZero && num === 0) return "text-foreground"
  const positive = options?.reverse ? num < 0 : num > 0
  const negative = options?.reverse ? num > 0 : num < 0
  if (positive) return "text-emerald-500 dark:text-emerald-400"
  if (negative) return "text-rose-500 dark:text-rose-400"
  return "text-foreground"
}
