export const RECURRING_DETECTION = {
  INTERVAL_THRESHOLDS: {
    WEEKLY: { min: 5, max: 9 },
    BIWEEKLY: { min: 12, max: 16 },
    MONTHLY: { min: 25, max: 35 },
    QUARTERLY: { min: 80, max: 100 },
    YEARLY: { min: 345, max: 385 },
  },
  AMOUNT_DEVIATION_FIXED: 20,
  AMOUNT_DEVIATION_PCT: 0.15,
  CONFIDENCE: {
    BASE: 0.55,
    PER_OCCURRENCE: 0.06,
    PER_DEVIATION: 0.1,
    MAX: 0.99,
    MAX_OCCURRENCES_FOR_SCORE: 6,
  },
} as const;

/**
 * Encargos financeiros que o motor de recorrência não deve transformar em
 * "assinatura".
 *
 * Juros do rotativo, IOF e multa por atraso têm exatamente a assinatura que o
 * detector procura: mesma descrição normalizada, ritmo mensal, valor parecido.
 * Só que ninguém "assina" juros — virar uma regra fixa faz a tela oferecer
 * cancelar uma cobrança que não se cancela, e joga o encargo na projeção como
 * se fosse gasto planejado.
 *
 * A comparação é por substring sobre o texto normalizado (sem acento, minúsculo).
 */
export const EXCLUDED_RECURRING_KEYWORDS = [
  "juros",
  "juros do rotativo",
  "juros rotativo",
  "juros de mora",
  "encargos",
  "encargo",
  "iof",
  "multa",
  "multa por atraso",
  "mora",
  "tarifa de atraso",
  "correcao monetaria",
  "rotativo",
  "parcelamento de fatura",
  "refinanciamento de fatura",
] as const;

export const PROJECTION = {
  DEFAULT_MONTHS: 6,
  MIN_MONTHS: 1,
  MAX_MONTHS: 24,
  VARIABLE_EXPENSE_LOOKBACK_DAYS: 90,
} as const;

export const SUBSCRIPTION_DETECTION = {
  BENFORD_ANOMALY_THRESHOLD: 5,
  MIN_OCCURRENCES: 3,
  MIN_HITS: 2,
  MONTHLY_INTERVAL_MIN_DAYS: 27,
  MONTHLY_INTERVAL_MAX_DAYS: 33,
} as const;
