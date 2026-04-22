"use client"

import { useState, useEffect, useCallback } from "react"

export interface UseApiError {
  title: string
  message: string
  status?: number
  details?: string
  action?: string
  raw?: unknown
}

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  errorInfo: UseApiError | null
  refetch: () => void
}

function titleForStatus(status: number) {
  if (status === 400) return "Não foi possível processar a solicitação"
  if (status === 401) return "Sessão expirada"
  if (status === 403) return "Acesso negado"
  if (status === 404) return "Dados não encontrados"
  if (status === 409) return "Conflito ao atualizar dados"
  if (status === 422) return "Dados inválidos"
  if (status === 429) return "Muitas tentativas"
  if (status >= 500) return "Serviço temporariamente indisponível"
  return "Erro ao carregar dados"
}

function actionForStatus(status: number) {
  if (status === 401) return "Entre novamente e tente recarregar esta tela."
  if (status === 403) return "Verifique se sua conta tem permissão para acessar estes dados."
  if (status === 404) return "Confira se os dados existem ou sincronize suas contas novamente."
  if (status === 429) return "Aguarde alguns instantes antes de tentar novamente."
  if (status >= 500) return "Tente novamente. Se persistir, confira a sincronização ou os logs do servidor."
  return "Revise os filtros usados e tente novamente."
}

function normalizeParsedError(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null
  const body = parsed as {
    message?: unknown
    error?: unknown
    details?: unknown
  }

  if (typeof body.error === "string") return body.error
  if (body.error && typeof body.error === "object") {
    const nested = body.error as { message?: unknown; detail?: unknown; details?: unknown }
    if (typeof nested.message === "string") return nested.message
    if (typeof nested.detail === "string") return nested.detail
    if (typeof nested.details === "string") return nested.details
  }
  if (typeof body.message === "string") return body.message
  if (typeof body.details === "string") return body.details
  return null
}

async function extractErrorInfo(res: Response): Promise<UseApiError> {
  const fallback = `${res.status} ${res.statusText || "Erro HTTP"}`
  let raw: unknown
  let details: string | undefined

  try {
    const text = await res.text()
    if (text) {
      try {
        raw = JSON.parse(text) as unknown
        details = normalizeParsedError(raw) ?? undefined
      } catch {
        details = text.length <= 280 ? text : undefined
        raw = text
      }
    }
  } catch {
    // Keep the generic fallback below.
  }

  return {
    title: titleForStatus(res.status),
    message: details ?? fallback,
    status: res.status,
    details: details && details !== fallback ? fallback : undefined,
    action: actionForStatus(res.status),
    raw,
  }
}

function unknownErrorInfo(error: unknown): UseApiError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      title: "Carregamento cancelado",
      message: "A solicitação foi interrompida antes de terminar.",
    }
  }

  if (error instanceof SyntaxError) {
    return {
      title: "Resposta inválida",
      message: "Recebemos uma resposta que não pôde ser lida.",
      action: "Tente novamente. Se persistir, verifique se a API está retornando JSON válido.",
    }
  }

  if (error instanceof TypeError) {
    return {
      title: "Falha de conexão",
      message: "Não foi possível falar com a API agora.",
      details: error.message,
      action: "Confira sua conexão e tente novamente.",
    }
  }

  if (error instanceof Error) {
    return {
      title: "Erro inesperado",
      message: error.message,
      action: "Tente novamente.",
    }
  }

  return {
    title: "Erro desconhecido",
    message: "Não foi possível carregar os dados.",
    action: "Tente novamente.",
  }
}

export function useApi<T>(
  url: string | null,
  params?: Record<string, string | undefined>,
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorInfo, setErrorInfo] = useState<UseApiError | null>(null)

  const paramsKey = params ? JSON.stringify(params) : ""

  const fetchData = useCallback(async () => {
    if (!url) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setErrorInfo(null)
    try {
      const u = new URL(url, window.location.origin)
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v != null && v !== "") u.searchParams.set(k, String(v))
        })
      }
      const res = await fetch(u.toString(), { cache: "no-store" })
      if (!res.ok) {
        const apiError = await extractErrorInfo(res)
        setErrorInfo(apiError)
        setError(apiError.message)
        return
      }
      const json = (await res.json()) as T
      setData(json)
    } catch (err) {
      const apiError = unknownErrorInfo(err)
      setErrorInfo(apiError)
      setError(apiError.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, errorInfo, refetch: fetchData }
}
