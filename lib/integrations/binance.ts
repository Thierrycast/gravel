import { createHmac } from "node:crypto"

const defaultBaseUrl = "https://api.binance.com"
const serverTimeTtlMs = 5 * 60 * 1000

type BinanceServerTimeCache = {
  offsetMs: number
  expiresAt: number
}

type ExchangeInfoCache = {
  payload: BinanceExchangeInfo
  expiresAt: number
}

type BinanceRequestOptions = {
  query?: Record<string, string | number | boolean | undefined>
  signed?: boolean
}

type BinanceExchangeSymbol = {
  symbol: string
  status?: string
  baseAsset?: string
  quoteAsset?: string
  permissions?: string[]
  isSpotTradingAllowed?: boolean
}

type BinanceExchangeInfo = {
  timezone?: string
  serverTime?: number
  symbols?: BinanceExchangeSymbol[]
}

declare global {
  var binanceServerTimeCache: BinanceServerTimeCache | undefined
  var binanceExchangeInfoCache: ExchangeInfoCache | undefined
}

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing env var: ${name}`)
  }
  return value
}

function getBaseUrl() {
  return process.env.BINANCE_API_BASE ?? defaultBaseUrl
}

function getApiKey() {
  return getEnv("BINANCE_API_KEY")
}

function getApiSecret() {
  return getEnv("BINANCE_API_SECRET")
}

function getRecvWindow() {
  const raw = process.env.BINANCE_RECV_WINDOW
  const parsed = raw ? Number(raw) : 5000
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000
}

function isValidServerTimeCache(
  entry?: BinanceServerTimeCache
): entry is BinanceServerTimeCache {
  return Boolean(entry && Date.now() < entry.expiresAt)
}

function isValidExchangeInfoCache(
  entry?: ExchangeInfoCache
): entry is ExchangeInfoCache {
  return Boolean(entry && Date.now() < entry.expiresAt)
}

async function getServerTimeOffset() {
  const cached = globalThis.binanceServerTimeCache
  if (isValidServerTimeCache(cached)) {
    return cached.offsetMs
  }

  const before = Date.now()
  const response = await fetch(`${getBaseUrl()}/api/v3/time`, {
    cache: "no-store",
  })
  const after = Date.now()

  if (!response.ok) {
    throw new Error(`Binance server time error: ${response.status}`)
  }

  const payload = (await response.json()) as { serverTime?: number }
  const serverTime = Number(payload.serverTime)

  if (!Number.isFinite(serverTime)) {
    throw new Error("Binance server time invalido")
  }

  const latencyMidpoint = before + (after - before) / 2
  const offsetMs = serverTime - latencyMidpoint

  globalThis.binanceServerTimeCache = {
    offsetMs,
    expiresAt: Date.now() + serverTimeTtlMs,
  }

  return offsetMs
}

function signQuery(queryString: string) {
  return createHmac("sha256", getApiSecret()).update(queryString).digest("hex")
}

async function createSignedQuery(
  query?: Record<string, string | number | boolean | undefined>
) {
  const offsetMs = await getServerTimeOffset()
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    params.set(key, String(value))
  }

  params.set("timestamp", String(Math.round(Date.now() + offsetMs)))
  params.set("recvWindow", String(getRecvWindow()))

  const queryString = params.toString()
  params.set("signature", signQuery(queryString))

  return params
}

async function handleResponse(response: Response) {
  if (response.ok) {
    return response.json()
  }

  const error = await response.json().catch(() => ({}))
  const message =
    typeof error?.msg === "string"
      ? error.msg
      : typeof error?.message === "string"
        ? error.message
        : ""

  throw new Error(`Binance error: ${response.status} ${message}`.trim())
}

async function binanceRequest(
  path: string,
  options: BinanceRequestOptions = {}
) {
  const url = new URL(`${getBaseUrl()}${path}`)

  if (options.signed) {
    const signedParams = await createSignedQuery(options.query)
    url.search = signedParams.toString()
  } else if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  const response = await fetch(url.toString(), {
    headers: options.signed
      ? {
          "X-MBX-APIKEY": getApiKey(),
          "Content-Type": "application/json",
        }
      : {
          "Content-Type": "application/json",
        },
    cache: "no-store",
  })

  return handleResponse(response)
}

export async function fetchSpotAccount() {
  return binanceRequest("/api/v3/account", { signed: true })
}

export async function fetchMyTrades(params: {
  symbol: string
  limit?: number
  fromId?: number
}) {
  return binanceRequest("/api/v3/myTrades", {
    signed: true,
    query: params,
  })
}

export async function fetchTickerPrices(params?: { symbols?: string[] }) {
  const query =
    params?.symbols && params.symbols.length > 0
      ? { symbols: JSON.stringify(params.symbols) }
      : undefined

  return binanceRequest("/api/v3/ticker/price", { query })
}

export async function fetchExchangeInfo() {
  const cached = globalThis.binanceExchangeInfoCache
  if (isValidExchangeInfoCache(cached)) {
    return cached.payload
  }

  const payload = (await binanceRequest(
    "/api/v3/exchangeInfo"
  )) as BinanceExchangeInfo

  globalThis.binanceExchangeInfoCache = {
    payload,
    expiresAt: Date.now() + serverTimeTtlMs,
  }

  return payload
}

export function selectPreferredTradingSymbol(
  asset: string,
  exchangeInfo: BinanceExchangeInfo
) {
  const normalizedAsset = asset.toUpperCase()
  const stableAssets = new Set(["USDT", "FDUSD", "USDC", "BUSD"])
  if (stableAssets.has(normalizedAsset)) {
    return {
      symbol: normalizedAsset,
      quoteAsset: normalizedAsset,
      price: 1,
      synthetic: true,
    }
  }

  const preferredQuotes = [
    "USDT",
    "FDUSD",
    "USDC",
    "BUSD",
    "BRL",
    "BTC",
    "ETH",
  ]

  const symbols = Array.isArray(exchangeInfo.symbols) ? exchangeInfo.symbols : []
  const tradableSymbols = symbols.filter((symbol) => {
    if (symbol.baseAsset !== normalizedAsset) return false
    if (symbol.status !== "TRADING") return false
    if (symbol.isSpotTradingAllowed === false) return false
    if (
      Array.isArray(symbol.permissions) &&
      symbol.permissions.length > 0 &&
      !symbol.permissions.includes("SPOT")
    ) {
      return false
    }

    return true
  })

  for (const quoteAsset of preferredQuotes) {
    const match = tradableSymbols.find(
      (symbol) => symbol.quoteAsset === quoteAsset
    )
    if (match?.symbol && match.quoteAsset) {
      return {
        symbol: match.symbol,
        quoteAsset: match.quoteAsset,
        synthetic: false,
      }
    }
  }

  return null
}
