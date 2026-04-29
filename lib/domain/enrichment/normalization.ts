export function normalizeFinancialText(value?: string | null) {
  if (!value) return null

  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

export function normalizeMerchantName(value?: string | null) {
  const normalized = normalizeFinancialText(value)
  if (!normalized) return null

  return normalized
    .replace(/\b(ltda|sa|s\/a|me|eireli|comercio|servicos|servicos?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function displayNameFromRaw(value?: string | null) {
  const normalized = value?.replace(/\s+/g, " ").trim()
  return normalized || null
}
