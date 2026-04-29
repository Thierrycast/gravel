import { Prisma } from "@prisma/client"

const BRL_CODES = new Set(["BRL", "R$"])
const USD_CODES = new Set(["USD", "USDT", "USDC", "BUSD"])

export function normalizeCurrencyCode(value?: string | null) {
  const code = value?.trim().toUpperCase()
  if (!code) return "BRL"
  if (code === "REAL" || code === "REAIS") return "BRL"
  if (code === "DOLAR" || code === "DOLLAR") return "USD"
  return code
}

export function isBrlCurrency(value?: string | null) {
  return BRL_CODES.has(normalizeCurrencyCode(value))
}

export function isUsdLikeCurrency(value?: string | null) {
  return USD_CODES.has(normalizeCurrencyCode(value))
}

export function decimal(value?: Prisma.Decimal | null) {
  return value ?? new Prisma.Decimal(0)
}

export function sumCurrencyDecimals<T>(
  rows: T[],
  amountOf: (row: T) => Prisma.Decimal | null | undefined,
  currencyOf: (row: T) => string | null | undefined,
  currencyCode = "BRL",
) {
  const target = normalizeCurrencyCode(currencyCode)
  return rows.reduce((total, row) => {
    if (normalizeCurrencyCode(currencyOf(row)) !== target) return total
    return total.plus(decimal(amountOf(row)))
  }, new Prisma.Decimal(0))
}
