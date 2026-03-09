export function parseNumberParam(value: string | null, fallback?: number) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function parseDateParam(value: string | null) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function normalizePagination(page?: number, pageSize?: number) {
  const currentPage = page && page > 0 ? page : 1
  const currentPageSize =
    pageSize && pageSize > 0 ? Math.min(pageSize, 500) : 50

  return {
    page: currentPage,
    pageSize: currentPageSize,
    skip: (currentPage - 1) * currentPageSize,
    take: currentPageSize,
  }
}

export function parseBooleanParam(value: string | null) {
  return value === "true" || value === "1"
}
