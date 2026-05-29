import { buildSearchParams } from "@/lib/utils"

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
  const qs = buildSearchParams(params)
  const url = `${BASE_URL}${path}${qs.size > 0 ? `?${qs}` : ""}`
  const res = await fetch(url, { cache: "no-store" })
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
