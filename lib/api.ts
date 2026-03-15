const BASE_URL = typeof window !== "undefined" ? "" : "http://localhost:3000"

interface ApiResponse<T> {
  summary?: unknown
  results: T
  meta?: unknown
}

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v)
    })
  }
  const res = await fetch(url.toString(), { cache: "no-store" })
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

export async function apiDomain<T>(
  path: string,
  params?: Record<string, string>,
): Promise<ApiResponse<T>> {
  return apiFetch<ApiResponse<T>>(`/api/domain${path}`, params)
}

export async function apiMetrics<T>(
  path: string,
  params?: Record<string, string>,
): Promise<ApiResponse<T>> {
  return apiFetch<ApiResponse<T>>(`/api/domain/metrics${path}`, params)
}
