import { buildLogoDevCryptoUrl, buildLogoDevUrl, resolveMerchantDomain } from "@/lib/domain/enrichment/logo-dev"

/**
 * Resolves a reliable logo URL for a given cryptocurrency asset ticker.
 */
export function getCryptoLogo(asset: string): string {
  const logoDevUrl = buildLogoDevCryptoUrl(asset)
  if (logoDevUrl) return logoDevUrl

  const ticker = asset.toLowerCase()
  // Reliable source for crypto icons from spothq/cryptocurrency-icons
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${ticker}.png`
}

/**
 * Normalizes text for comparison or display.
 */
export function normalizeText(text: string | null | undefined): string | null {
  if (!text) return null
  return text
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

/**
 * Resolves a reliable logo URL for a given merchant name.
 */
export function getMerchantLogo(name: string): string | null {
  const normalized = normalizeText(name)
  if (!normalized) return null

  const domain = resolveMerchantDomain(name)
  if (domain) return buildLogoDevUrl(domain)

  // Known patterns for common recurring services
  if (normalized.includes("netflix")) return buildLogoDevUrl("netflix.com")
  if (normalized.includes("spotify")) return buildLogoDevUrl("spotify.com")
  if (normalized.includes("amazon") || normalized.includes("prime")) return buildLogoDevUrl("amazon.com")
  if (normalized.includes("google") || normalized.includes("youtube")) return buildLogoDevUrl("google.com")
  if (normalized.includes("apple") || normalized.includes("icloud")) return buildLogoDevUrl("apple.com")
  if (normalized.includes("microsoft") || normalized.includes("office")) return buildLogoDevUrl("microsoft.com")
  if (normalized.includes("adobe")) return buildLogoDevUrl("adobe.com")
  if (normalized.includes("disney")) return buildLogoDevUrl("disney.com")
  
  // Generic fallback using Clearbit (free tier/public)
  // return `https://logo.clearbit.com/${normalized.replace(/\s+/g, '')}.com`
  return null
}
