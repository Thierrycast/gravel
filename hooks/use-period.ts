"use client"

import { useCallback, useMemo } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"

/**
 * Period selector backed by URL state.
 *
 * The default period is the **current month** (`mtd`). Pages can use the
 * returned `params` directly when calling backend metric endpoints — they all
 * accept `period` and the explicit `from`/`to` window.
 *
 * Supported values mirror what `lib/domain/analytics.ts → resolvePeriodStart`
 * understands, plus `custom` for explicit ranges.
 */
export type PeriodKey =
  | "mtd"
  | "30d"
  | "90d"
  | "180d"
  | "12m"
  | "ytd"
  | "all"
  | "custom"

export interface PeriodOption {
  value: PeriodKey
  label: string
  shortLabel: string
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { value: "mtd", label: "Este mês", shortLabel: "Mês" },
  { value: "30d", label: "Últimos 30 dias", shortLabel: "30d" },
  { value: "90d", label: "Últimos 90 dias", shortLabel: "90d" },
  { value: "180d", label: "Últimos 6 meses", shortLabel: "6m" },
  { value: "12m", label: "Últimos 12 meses", shortLabel: "12m" },
  { value: "ytd", label: "Ano até agora", shortLabel: "Ano" },
  { value: "all", label: "Todo o histórico", shortLabel: "Tudo" },
]

export interface PeriodState {
  period: PeriodKey
  from?: string
  to?: string
  /** params object ready to pass to `useApi` */
  params: Record<string, string>
  setPeriod: (next: PeriodKey) => void
  setRange: (from: string, to: string) => void
  reset: () => void
  label: string
}

export function usePeriod(defaultPeriod: PeriodKey = "mtd"): PeriodState {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const period = (searchParams.get("period") as PeriodKey | null) ?? defaultPeriod
  const from = searchParams.get("from") ?? undefined
  const to = searchParams.get("to") ?? undefined

  const params = useMemo<Record<string, string>>(() => {
    if (period === "custom" && (from || to)) {
      const out: Record<string, string> = {}
      if (from) out.from = from
      if (to) out.to = to
      return out
    }
    return { period }
  }, [period, from, to])

  const updateUrl = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname]
  )

  const setPeriod = useCallback(
    (next: PeriodKey) => {
      const updated = new URLSearchParams(searchParams.toString())
      if (next === defaultPeriod) {
        updated.delete("period")
      } else {
        updated.set("period", next)
      }
      if (next !== "custom") {
        updated.delete("from")
        updated.delete("to")
      }
      updateUrl(updated)
    },
    [searchParams, defaultPeriod, updateUrl]
  )

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const updated = new URLSearchParams(searchParams.toString())
      updated.set("period", "custom")
      updated.set("from", nextFrom)
      updated.set("to", nextTo)
      updateUrl(updated)
    },
    [searchParams, updateUrl]
  )

  const reset = useCallback(() => {
    const updated = new URLSearchParams(searchParams.toString())
    updated.delete("period")
    updated.delete("from")
    updated.delete("to")
    updateUrl(updated)
  }, [searchParams, updateUrl])

  const label = useMemo(() => {
    if (period === "custom" && (from || to)) {
      return `${from ?? "início"} → ${to ?? "hoje"}`
    }
    return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? "Este mês"
  }, [period, from, to])

  return { period, from, to, params, setPeriod, setRange, reset, label }
}
