"use client"

import { useState, useEffect, useCallback } from "react"

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  url: string | null,
  params?: Record<string, string>,
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const paramsKey = params ? JSON.stringify(params) : ""

  const fetchData = useCallback(async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const u = new URL(url, window.location.origin)
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v) u.searchParams.set(k, v)
        })
      }
      const res = await fetch(u.toString())
      if (!res.ok) throw new Error(`${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
