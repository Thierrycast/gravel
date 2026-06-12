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
  return pattern
    .split(/[\n|,;]+/g)
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
