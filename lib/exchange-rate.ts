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
}

const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Fetch current USD→BRL rate.
 */
export async function getUsdBrlRate(): Promise<number> {
  const cached = globalThis.usdBrlCache
  if (cached && Date.now() < cached.expiresAt) {
    return cached.rate
  }

  // Source 1: AwesomeAPI (fast, reliable, no auth)
  try {
    const res = await fetch(
      "https://economia.awesomeapi.com.br/json/last/USD-BRL",
      { cache: "no-store" }
    )

    if (res.ok) {
      const data = await res.json()
      const bid = parseFloat(data?.USDBRL?.bid)
      if (Number.isFinite(bid) && bid > 0) {
        globalThis.usdBrlCache = {
          rate: bid,
          expiresAt: Date.now() + CACHE_TTL_MS,
        }
        return bid
      }
    }
  } catch {
    // ignore and try next
  }

  // Source 2: Exchangerate-API (V4 is free, no auth)
  try {
    const res = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { cache: "no-store" }
    )

    if (res.ok) {
      const data = await res.json()
      const rate = data?.rates?.BRL
      if (Number.isFinite(rate) && rate > 0) {
        globalThis.usdBrlCache = {
          rate,
          expiresAt: Date.now() + CACHE_TTL_MS,
        }
        return rate
      }
    }
  } catch {
    // ignore and try next
  }

  // Fallback 1: use cached value if available (even if expired)
  if (cached) {
    return cached.rate
  }

  // Fallback 2: Try to fetch from database snapshots (e.g. USDT/BRL)
  try {
    const latestBinancePrice = await prisma.binanceAssetPriceSnapshot.findFirst({
      where: {
        symbol: { in: ["USDTBRL", "USDCBRL"] },
      },
      orderBy: { fetchedAt: "desc" },
    })

    if (latestBinancePrice) {
      const rate = Number(latestBinancePrice.price)
      if (Number.isFinite(rate) && rate > 0) {
        return rate
      }
    }

    const latestDomainAsset = await prisma.domainCryptoAsset.findFirst({
      where: {
        asset: { in: ["USDT", "USDC", "USD"] },
        quoteAsset: "BRL",
      },
      orderBy: { updatedAt: "desc" },
    })

    if (latestDomainAsset?.price) {
      const rate = Number(latestDomainAsset.price)
      if (Number.isFinite(rate) && rate > 0) {
        return rate
      }
    }
  } catch {
    // ignore DB errors during fallback
  }

  // Last resort fallback: a value closer to recent averages (as of early 2024-2026)
  console.warn("getUsdBrlRate: Using hardcoded fallback (5.4). All API and DB lookups failed.")
  return 5.4
}
