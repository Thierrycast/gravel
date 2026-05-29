import type { Account } from "@/lib/types/api"

/**
 * Common account and investment labels for the UI.
 */
export function getTypeLabel(kind: string | null): string {
  if (!kind) return "Outro"
  
  const labels: Record<string, string> = {
    BANK: "Conta Bancária",
    CARD: "Cartão de Crédito",
    CREDIT: "Cartão de Crédito",
    SAVINGS: "Poupança",
    CHECKING: "Conta Corrente",
    INVESTMENT: "Investimento",
    CASH: "Carteira Física",
    OTHER: "Outro",
    // Pluggy raw subtype values
    CHECKING_ACCOUNT: "Conta Corrente",
    CREDIT_CARD: "Cartão de Crédito",
    SAVINGS_ACCOUNT: "Poupança",
    PAYMENT_ACCOUNT: "Conta de Pagamento",
    CASH_MANAGEMENT: "Gestão de Caixa",
    // Investment types
    FIXED_INCOME: "Renda Fixa",
    MUTUAL_FUND: "Fundo de Investimento",
    STOCK: "Ações",
    ETF: "ETF",
    COE: "COE",
  }
  
  return labels[kind] || kind
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function isCreditAccount(account: Account): boolean {
  return account.kind === "CARD" || account.kind === "CREDIT"
}
