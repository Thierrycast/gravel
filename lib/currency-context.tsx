"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

export type Currency = "BRL" | "USD"

export interface CurrencyContextValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  isPrivate: boolean
  setIsPrivate: (p: boolean) => void
  /** Exchange rate: 1 USD = X BRL. Used to convert values. */
  usdBrlRate: number
  /** Convert a BRL value to the selected currency */
  convert: (brlValue: number | null | undefined) => number
  /** Format a BRL value in the selected currency */
  format: (brlValue: number | null | undefined) => string
  /** Format a BRL value with sign and privacy support */
  formatSigned: (brlValue: number | null | undefined, mode?: "none" | "always" | "signed") => string
  /** Compact format for large values */
  formatCompact: (brlValue: number | null | undefined) => string
}

const STORAGE_KEY = "gravel:currency"
const PRIVACY_KEY = "gravel:privacy"
const FALLBACK_RATE = 5.7 // fallback if fetch fails

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "BRL",
  setCurrency: () => {},
  isPrivate: false,
  setIsPrivate: () => {},
  usdBrlRate: FALLBACK_RATE,
  convert: (v) => v ?? 0,
  format: (v) => `R$ ${(v ?? 0).toFixed(2)}`,
  formatSigned: (v) => `R$ ${(v ?? 0).toFixed(2)}`,
  formatCompact: (v) => `R$ ${(v ?? 0).toFixed(2)}`,
})

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const brlCompactFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const usdCompactFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("BRL")
  const [isPrivate, setIsPrivateState] = useState(false)
  const [usdBrlRate, setUsdBrlRate] = useState(FALLBACK_RATE)

  // Load preference from localStorage on mount (client-only; SSR-safe default above).
  // The setState calls are deliberate one-shot hydration from a platform API.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const storedCurrency = localStorage.getItem(STORAGE_KEY) as Currency | null
      if (storedCurrency === "BRL" || storedCurrency === "USD") setCurrencyState(storedCurrency)

      const storedPrivacy = localStorage.getItem(PRIVACY_KEY)
      if (storedPrivacy === "true") setIsPrivateState(true)
    } catch {}
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL")
      .then((r) => r.json())
      .then((data) => {
        const rate = parseFloat(data?.USDBRL?.bid ?? "0")
        if (rate > 0) setUsdBrlRate(rate)
      })
      .catch(() => {}) // silently fallback to hardcoded rate
  }, [])

  function setCurrency(c: Currency) {
    setCurrencyState(c)
    try { localStorage.setItem(STORAGE_KEY, c) } catch {}
  }

  function setIsPrivate(p: boolean) {
    setIsPrivateState(p)
    try { localStorage.setItem(PRIVACY_KEY, String(p)) } catch {}
  }

  function convert(brlValue: number | null | undefined): number {
    const v = brlValue ?? 0
    if (currency === "USD") return v / usdBrlRate
    return v
  }

  function format(brlValue: number | null | undefined): string {
    if (isPrivate) return "••••"
    
    const converted = convert(brlValue)
    if (currency === "USD") return usdFmt.format(converted)
    return brlFmt.format(converted === 0 ? 0 : converted)
  }

  function formatSigned(brlValue: number | null | undefined, mode: "none" | "always" | "signed" = "none"): string {
    if (isPrivate) return "••••"
    
    const num = convert(brlValue)
    const fmt = currency === "USD" ? usdFmt : brlFmt
    const formatted = fmt.format(Math.abs(num))
    
    if (num < 0) return `−${formatted}`
    if ((mode === "always" || (mode === "signed" && num !== 0)) && num > 0) {
      return `+${formatted}`
    }
    return formatted
  }

  function formatCompact(brlValue: number | null | undefined): string {
    if (isPrivate) return "••••"
    
    const converted = convert(brlValue)
    if (currency === "USD") return usdCompactFmt.format(converted)
    return brlCompactFmt.format(converted)
  }

  return (
    <CurrencyContext.Provider value={{ 
      currency, setCurrency, isPrivate, setIsPrivate, usdBrlRate, convert, format, formatSigned, formatCompact 
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
