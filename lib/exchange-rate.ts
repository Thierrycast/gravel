/**
 * Fetches the current USD/BRL exchange rate.
 * Uses multiple APIs and falls back to database snapshots or a hardcoded value.
 */
import { prisma } from "./prisma"

type ExchangeRateCache = {
  rate: number
  expiresAt: number
}

declare global {
  var usdBrlCache: ExchangeRateCache | undefined
  var usdBrlSource: ExchangeRateSource | undefined
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const HARDCODED_USD_BRL_FALLBACK = 5.8

const RETRY_BASE_MS = 200
const RETRY_MAX_ATTEMPTS = 3
const FETCH_TIMEOUT_MS = 5_000

export type ExchangeRateSource =
  | "awesomeapi"
  | "exchangerate-api"
  | "stale-cache"
  | "binance-snapshot"
  | "domain-asset"
  | "hardcoded-fallback"

export type RateLookup = {
  rate: number
  source: ExchangeRateSource
  /** True when no live API/DB hit succeeded — UI should warn the user. */
  isFallback: boolean
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Run an async producer with capped exponential backoff retries.
 * Returns null if every attempt failed; never throws.
 */
async function withRetries<T>(
  label: string,
  producer: () => Promise<T | null>
): Promise<T | null> {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const value = await producer()
      if (value !== null && value !== undefined) return value
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(
        `[exchange-rate] ${label} attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS} failed: ${reason}`
      )
    }
    if (attempt < RETRY_MAX_ATTEMPTS - 1) {
      const backoff = RETRY_BASE_MS * 2 ** attempt
      await sleep(backoff)
    }
  }
  return null
}

async function fromAwesomeApi(): Promise<number | null> {
  return withRetries("awesomeapi", async () => {
    const res = await fetchWithTimeout(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL"
    )
    if (!res.ok) return null
    const data = await res.json()
    const bid = parseFloat(data?.USDBRL?.bid)
    return Number.isFinite(bid) && bid > 0 ? bid : null
  })
}

async function fromExchangeRateApi(): Promise<number | null> {
  return withRetries("exchangerate-api", async () => {
    const res = await fetchWithTimeout(
      "https://api.exchangerate-api.com/v4/latest/USD"
    )
    if (!res.ok) return null
    const data = await res.json()
    const rate = data?.rates?.BRL
    return Number.isFinite(rate) && rate > 0 ? rate : null
  })
}

async function fromBinanceSnapshot(): Promise<number | null> {
  try {
    const latestBinancePrice = await prisma.binanceAssetPriceSnapshot.findFirst({
      where: { symbol: { in: ["USDTBRL", "USDCBRL"] } },
      orderBy: { fetchedAt: "desc" },
    })
    if (!latestBinancePrice) return null
    const rate = Number(latestBinancePrice.price)
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
}

async function fromDomainAsset(): Promise<number | null> {
  try {
    const latestDomainAsset = await prisma.domainCryptoAsset.findFirst({
      where: { asset: { in: ["USDT", "USDC", "USD"] }, quoteAsset: "BRL" },
      orderBy: { updatedAt: "desc" },
    })
    if (!latestDomainAsset?.price) return null
    const rate = Number(latestDomainAsset.price)
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
}

function rememberRate(rate: number, source: ExchangeRateSource) {
  globalThis.usdBrlCache = { rate, expiresAt: Date.now() + CACHE_TTL_MS }
  globalThis.usdBrlSource = source
}

/**
 * Fetch current USD→BRL rate with full lookup chain.
 * Exposes both the rate and the source so callers can warn when degraded.
 */
export async function getUsdBrlRateDetailed(): Promise<RateLookup> {
  const cached = globalThis.usdBrlCache
  const cachedSource = globalThis.usdBrlSource
  if (cached && Date.now() < cached.expiresAt && cachedSource) {
    return {
      rate: cached.rate,
      source: cachedSource,
      isFallback:
        cachedSource === "stale-cache" ||
        cachedSource === "binance-snapshot" ||
        cachedSource === "domain-asset" ||
        cachedSource === "hardcoded-fallback",
    }
  }

  const awesome = await fromAwesomeApi()
  if (awesome !== null) {
    rememberRate(awesome, "awesomeapi")
    return { rate: awesome, source: "awesomeapi", isFallback: false }
  }

  const exchangerate = await fromExchangeRateApi()
  if (exchangerate !== null) {
    rememberRate(exchangerate, "exchangerate-api")
    return { rate: exchangerate, source: "exchangerate-api", isFallback: false }
  }

  if (cached) {
    return { rate: cached.rate, source: "stale-cache", isFallback: true }
  }

  const binance = await fromBinanceSnapshot()
  if (binance !== null) {
    rememberRate(binance, "binance-snapshot")
    return { rate: binance, source: "binance-snapshot", isFallback: true }
  }

  const domain = await fromDomainAsset()
  if (domain !== null) {
    rememberRate(domain, "domain-asset")
    return { rate: domain, source: "domain-asset", isFallback: true }
  }

  console.warn(
    `[exchange-rate] All providers failed; using hardcoded fallback (${HARDCODED_USD_BRL_FALLBACK}).`
  )
  return {
    rate: HARDCODED_USD_BRL_FALLBACK,
    source: "hardcoded-fallback",
    isFallback: true,
  }
}

/**
 * Backward-compatible accessor — returns just the rate.
 */
export async function getUsdBrlRate(): Promise<number> {
  const { rate } = await getUsdBrlRateDetailed()
  return rate
}
