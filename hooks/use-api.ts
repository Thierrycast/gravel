"use client"

import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { buildSearchParams } from "@/lib/utils"

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

/**
 * Internal error type carrying structured info up through the query layer.
 * useQuery preserves Error instances; we attach UseApiError as `.info`.
 */
class ApiError extends Error {
  info: UseApiError
  constructor(info: UseApiError) {
    super(info.message)
    this.info = info
    this.name = "ApiError"
  }
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

function buildUrl(url: string, params?: Record<string, string | undefined>) {
  const qs = buildSearchParams(params)
  return `${url}${qs.size > 0 ? `?${qs}` : ""}`
}

export function useApi<T>(
  url: string | null,
  params?: Record<string, string | undefined>,
): UseApiResult<T> {
  const paramsKey = useMemo(() => (params ? JSON.stringify(params) : ""), [params])

  const queryFn = useCallback(async (): Promise<T> => {
    if (!url) throw new ApiError({ title: "Sem URL", message: "URL ausente" })
    const target = buildUrl(url, params)
    const res = await fetch(target, { cache: "no-store" })
    if (!res.ok) {
      const info = await extractErrorInfo(res)
      throw new ApiError(info)
    }
    return (await res.json()) as T
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, paramsKey])

  const query = useQuery<T, Error>({
    queryKey: ["api", url ?? "noop", paramsKey],
    queryFn,
    enabled: !!url,
  })

  const errorInfo: UseApiError | null = query.error
    ? query.error instanceof ApiError
      ? query.error.info
      : unknownErrorInfo(query.error)
    : null

  return {
    data: query.data ?? null,
    loading: query.isPending && !!url,
    error: errorInfo?.message ?? null,
    errorInfo,
    refetch: () => {
      void query.refetch()
    },
  }
}
