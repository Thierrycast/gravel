function normalizeSalaryLookup(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? ""
  )
}

function splitPattern(pattern: string) {
  // Divide apenas em quebras de linha: descrições bancárias reais contêm "|"
  // e vírgulas (ex.: "Transferência Recebida|FULANO"), e dividir nelas
  // transformava um padrão específico em termos genéricos — "transferencia
  // recebida" sozinho fazia QUALQUER transferência virar salário.
  return pattern
    .split(/[\n]+/g)
    .map((item) => normalizeSalaryLookup(item))
    .filter((item) => item.length > 0)
}

export function normalizeSalaryPatterns(patterns: string[]) {
  return Array.from(new Set(patterns.flatMap(splitPattern)))
}

export function parseSalaryPatternsConfig(configJson?: string | null) {
  if (!configJson) return []

  try {
    const config = JSON.parse(configJson) as { salaryPatterns?: unknown }
    return Array.isArray(config.salaryPatterns)
      ? normalizeSalaryPatterns(
          config.salaryPatterns.filter(
            (pattern): pattern is string =>
              typeof pattern === "string" && pattern.trim().length > 0
          )
        )
      : []
  } catch {
    return []
  }
}

export function matchesSalaryPatternValues(
  values: Array<string | null | undefined>,
  salaryPatterns: string[]
) {
  if (salaryPatterns.length === 0) return false

  const lookup = normalizeSalaryLookup(values.filter(Boolean).join(" "))
  if (!lookup) return false

  return salaryPatterns.some((pattern) => {
    const normalizedPattern = normalizeSalaryLookup(pattern)
    return (
      normalizedPattern.length > 0 &&
      (lookup.includes(normalizedPattern) || normalizedPattern.includes(lookup))
    )
  })
}

export function salaryMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Rótulos que o banco usa quando NÃO há contraparte identificada.
 *
 * A Inbox agrupa candidatos a salário por descrição normalizada. Quando
 * `merchantName` é nulo — o caso comum em Pix —, a chave vira o texto genérico
 * do lançamento, e aí depósitos de origens completamente diferentes, em meses
 * diferentes, caem no mesmo grupo. Dois deles bastam para a Inbox anunciar
 * "possível salário não confirmado" sobre dinheiro que não tem nada a ver com
 * salário.
 *
 * A lista é de rótulo puro: "Transferência Recebida|FULANO" tem contraparte e
 * não entra aqui — o que agrupa naquele caso é o nome de quem mandou, que é
 * justamente o sinal que queremos.
 */
const GENERIC_INCOME_LABELS = [
  "pix",
  "pix recebido",
  "pix recebida",
  "recebimento pix",
  "transferencia",
  "transferencia recebida",
  "transferencia recebido",
  "transferencia entre contas",
  "ted",
  "ted recebida",
  "doc",
  "doc recebido",
  "deposito",
  "deposito em conta",
  "credito",
  "credito em conta",
  "credito em conta corrente",
  "pagamento",
  "pagamento recebido",
  "estorno",
  "outros",
  "outras entradas",
]

/**
 * `true` quando o texto é rótulo genérico de entrada — não serve como chave de
 * agrupamento, porque não identifica origem nenhuma.
 */
export function isGenericIncomeLabel(value?: string | null) {
  const normalized = normalizeSalaryLookup(value)
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return true
  return GENERIC_INCOME_LABELS.includes(normalized)
}
