/**
 * Official brand colors for major Brazilian banks and fintechs.
 * Used for visual consistency in cards, progress bars, and avatars.
 */
export const BANK_BRAND_COLORS: Record<string, string> = {
  'nubank':         '#8A05BE',
  'nu pagamentos':  '#8A05BE',
  'nu bank':        '#8A05BE',
  
  'inter':          '#FF7A00',
  'banco inter':    '#FF7A00',
  
  'mercado pago':   '#009EE3',
  'mercadopago':    '#009EE3',
  
  'banco do brasil': '#FFCC00',
  'bb':              '#FFCC00',
  
  'bradesco':       '#CC092F',
  
  'santander':      '#EC0000',
  
  'caixa':          '#005CA9',
  'caixa economica':'#005CA9',
  
  'c6':             '#444444',
  'c6 bank':        '#444444',
  
  'xp':             '#1A1A1A',
  'xp investimentos':'#1A1A1A',
  
  'itau':           '#EC7000',
  'itau unibanco':  '#EC7000',
  
  'btg':            '#072B61',
  'btg pactual':    '#072B61',
  
  'picpay':         '#21C25E',
  
  'pagbank':        '#00C86F',
  'pagseguro':      '#00C86F',
}

/**
 * Resolves a brand color based on the institution name or slug.
 */
export function getBankColor(name?: string | null): string {
  if (!name) return '#6B7280'
  
  const lookup = name.toLowerCase().trim()
  
  if (BANK_BRAND_COLORS[lookup]) return BANK_BRAND_COLORS[lookup]
  
  for (const [key, color] of Object.entries(BANK_BRAND_COLORS)) {
    if (lookup.includes(key) || key.includes(lookup)) return color
  }
  
  return '#6B7280'
}
