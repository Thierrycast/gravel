/**
 * Resolves a reliable logo URL for a given cryptocurrency asset ticker.
 */
export function getCryptoLogo(asset: string): string {
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

  // Known patterns for common recurring services
  if (normalized.includes("netflix")) return "https://www.netflix.com/favicon.ico"
  if (normalized.includes("spotify")) return "https://www.scdn.co/mirror/home/twitter-og.png"
  if (normalized.includes("amazon") || normalized.includes("prime")) return "https://www.amazon.com/favicon.ico"
  if (normalized.includes("google") || normalized.includes("youtube")) return "https://www.google.com/favicon.ico"
  if (normalized.includes("apple") || normalized.includes("icloud")) return "https://www.apple.com/favicon.ico"
  if (normalized.includes("microsoft") || normalized.includes("office")) return "https://www.microsoft.com/favicon.ico"
  if (normalized.includes("adobe")) return "https://www.adobe.com/favicon.ico"
  if (normalized.includes("disney")) return "https://static-assets.bamgrid.com/product/disneyplus/images/share-default.14f444453695496543621f853359d361.png"
  
  // Generic fallback using Clearbit (free tier/public)
  // return `https://logo.clearbit.com/${normalized.replace(/\s+/g, '')}.com`
  return null
}
