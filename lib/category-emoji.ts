const CATEGORY_EMOJI: Record<string, string> = {
  "alimentação": "🍔",
  "restaurantes": "🍽️",
  "supermercado": "🛒",
  "transporte": "🚗",
  "moradia": "🏠",
  "aluguel": "🏠",
  "saúde": "💊",
  "dentista": "🦷",
  "dentistas": "🦷",
  "odonto": "🦷",
  "odontologia": "🦷",
  "educação": "📚",
  "lazer": "🎮",
  "entretenimento": "🎬",
  "compras": "🛍️",
  "vestuário": "👕",
  "vestiário": "👕",
  "serviços": "🔧",
  "assinaturas": "📱",
  "streaming": "📺",
  "telefone": "📞",
  "internet": "🌐",
  "energia": "⚡",
  "água": "💧",
  "gás": "🔥",
  "seguros": "🛡️",
  "impostos": "📋",
  "pets": "🐾",
  "viagem": "✈️",
  "beleza": "💅",
  "farmácia": "💊",
  "esporte": "🏋️",
  "academia": "🏋️",
  "doações": "❤️",
  "investimentos": "📈",
  "poupança": "🏦",
  "salário": "💰",
  "freelance": "💻",
  "outros": "📌",
  "sem categoria": "📌",
  "pagamento de cartão de crédito": "💳",
  "transferência": "🔄",
  "pix": "⚡",
  "mercado": "🛒",
  "uber": "🚕",
  "ifood": "🍕",
  "combustível": "⛽",
  "estacionamento": "🅿️",
  "eletrônicos": "🖥️",
  "jogos": "🎮",
  "música": "🎵",
  "livros": "📖",
  "livraria": "📚",
  "livrarias": "📚",
  "presentes": "🎁",
  "taxas bancárias": "🏦",
  "juros": "📊",
  "multas": "⚠️",
  "manutenção": "🔨",
  "limpeza": "🧹",
  "móveis": "🪑",
  "decoração": "🖼️",
  "telecomunicação": "📞",
  "universidade": "🎓",
  "serviços digitais": "💻",
  "restaurantes, bares e lanchonetes": "🍽️",
  "sem categoria de saida": "📌",
  "compras online": "🛒",
  "alimentos e bebidas": "🍔",
  "empréstimos e financiamento": "🏦",
  "impostos sobre operações financeiras": "📋",
  "jogos e videogames": "🎮",
  "transferência entre minhas contas": "↔️",
  "transferencia entre minhas contas": "↔️",
  "transferência mesma titularidade": "↔️",
  "transferencia mesma titularidade": "↔️",
  "transferência entre contas": "↔️",
  "transferencia entre contas": "↔️",
  "transferência interna": "↔️",
  "transferencia interna": "↔️",
  "transferências": "🔄",
  "transferência - pix": "⚡",
}

// Stable color palette for categories — each category gets a consistent color
// Categorical palette slots — see app/globals.css (--chart-1..8, --chart-neutral).
// Colour follows the ENTITY (the category), never its rank, so the same category
// keeps the same hue on every screen. Slots are grouped by spending domain; the
// "meta" rows (transfers, taxes, uncategorised) deliberately take the neutral
// slot so they never compete with real spending for a categorical hue.
const CATEGORY_COLORS: Record<string, string> = {
  // 1 · blue — mobilidade e telecom
  "transporte": "var(--chart-1)",
  "uber": "var(--chart-1)",
  "viagem": "var(--chart-1)",
  "telecomunicação": "var(--chart-1)",
  "telefone": "var(--chart-1)",
  "internet": "var(--chart-1)",

  // 2 · orange — comer fora
  "restaurantes, bares e lanchonetes": "var(--chart-2)",
  "restaurantes": "var(--chart-2)",
  "alimentos e bebidas": "var(--chart-2)",
  "alimentação": "var(--chart-2)",

  // 3 · aqua — saúde e cuidados
  "farmácia": "var(--chart-3)",
  "saúde": "var(--chart-3)",
  "dentista": "var(--chart-3)",
  "dentistas": "var(--chart-3)",
  "odonto": "var(--chart-3)",
  "odontologia": "var(--chart-3)",
  "pets": "var(--chart-3)",

  // 4 · yellow — moradia e contas de casa
  "moradia": "var(--chart-4)",
  "aluguel": "var(--chart-4)",
  "energia": "var(--chart-4)",
  "água": "var(--chart-4)",

  // 5 · magenta — compras e aparência
  "compras": "var(--chart-5)",
  "compras online": "var(--chart-5)",
  "vestuário": "var(--chart-5)",
  "vestiário": "var(--chart-5)",
  "beleza": "var(--chart-5)",

  // 6 · green — mercado
  "supermercado": "var(--chart-6)",
  "mercado": "var(--chart-6)",

  // 7 · violet — lazer, assinaturas e educação
  "lazer": "var(--chart-7)",
  "entretenimento": "var(--chart-7)",
  "streaming": "var(--chart-7)",
  "assinaturas": "var(--chart-7)",
  "jogos e videogames": "var(--chart-7)",
  "jogos": "var(--chart-7)",
  "universidade": "var(--chart-7)",
  "educação": "var(--chart-7)",
  "livros": "var(--chart-7)",
  "livraria": "var(--chart-7)",
  "livrarias": "var(--chart-7)",

  // 8 · red — serviços, dívida e doações
  "serviços": "var(--chart-8)",
  "serviços digitais": "var(--chart-8)",
  "empréstimos e financiamento": "var(--chart-8)",
  "investimentos": "var(--chart-8)",
  "doações": "var(--chart-8)",

  // neutral — movimentos que não são despesa de verdade
  "sem categoria de saida": "var(--chart-neutral)",
  "sem categoria": "var(--chart-neutral)",
  "impostos sobre operações financeiras": "var(--chart-neutral)",
  "impostos": "var(--chart-neutral)",
  "seguros": "var(--chart-neutral)",
  "pagamento de cartão de crédito": "var(--chart-neutral)",
  "transferência entre minhas contas": "var(--chart-neutral)",
  "transferencia entre minhas contas": "var(--chart-neutral)",
  "transferência mesma titularidade": "var(--chart-neutral)",
  "transferencia mesma titularidade": "var(--chart-neutral)",
  "transferência entre contas": "var(--chart-neutral)",
  "transferencia entre contas": "var(--chart-neutral)",
  "transferência interna": "var(--chart-neutral)",
  "transferencia interna": "var(--chart-neutral)",
  "transferência": "var(--chart-neutral)",
  "transferências": "var(--chart-neutral)",
  "transferência - pix": "var(--chart-neutral)",
  "pix": "var(--chart-neutral)",
}

// Fallback for categories not in the map: the same eight validated slots, walked
// in fixed order. Never a generated hue — a ninth unmapped category reuses slot 1.
const FALLBACK_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)",
]

export function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase().trim()
  if (CATEGORY_EMOJI[lower]) return CATEGORY_EMOJI[lower]
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI).sort((a, b) => b[0].length - a[0].length)) {
    if (lower.includes(key) || key.includes(lower)) return emoji
  }
  return "📌"
}

export function getCategoryColor(name: string, index?: number): string {
  const lower = name.toLowerCase().trim()
  if (CATEGORY_COLORS[lower]) return CATEGORY_COLORS[lower]
  for (const [key, color] of Object.entries(CATEGORY_COLORS).sort((a, b) => b[0].length - a[0].length)) {
    if (lower.includes(key) || key.includes(lower)) return color
  }
  return FALLBACK_COLORS[(index ?? 0) % FALLBACK_COLORS.length]
}
