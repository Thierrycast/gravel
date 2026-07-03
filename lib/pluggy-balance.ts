import { Prisma, SourceProvider } from "@prisma/client"

import { fetchAccountBalance, PluggyApiError } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

export type RealtimeBalanceResult = {
  accountId: string
  ok: boolean
  balance: number | null
  currencyCode: string | null
  updateDateTime: string | null
  // Saldo servido (realtime quando ok, senão o último salvo).
  effectiveBalance: number | null
  source: "realtime" | "cached"
  status: string
  message?: string
}

// Mensagens amigáveis por código de erro do endpoint de balance da Pluggy.
const BALANCE_ERROR_MESSAGES: Record<string, string> = {
  BALANCE_INVALID_REQUEST: "Requisição de saldo inválida.",
  BALANCE_CONSENT_ERROR:
    "O consentimento com o banco expirou. Reconecte a instituição.",
  BALANCE_NOT_FOUND: "Saldo em tempo real indisponível para esta conta.",
  BALANCE_OPEN_FINANCE_RATE_LIMIT:
    "Muitas consultas de saldo. Tente novamente em instantes.",
  BALANCE_FETCH_ERROR: "O banco não retornou o saldo agora.",
  BALANCE_CONNECTOR_UNAVAILABLE:
    "A instituição está temporariamente indisponível.",
}

function messageForBalanceError(error: PluggyApiError): string {
  if (error.code && BALANCE_ERROR_MESSAGES[error.code]) {
    return BALANCE_ERROR_MESSAGES[error.code]
  }
  // Fallback por status quando a Pluggy não manda `code`.
  const byStatus: Record<number, string> = {
    400: BALANCE_ERROR_MESSAGES.BALANCE_INVALID_REQUEST,
    403: BALANCE_ERROR_MESSAGES.BALANCE_CONSENT_ERROR,
    404: BALANCE_ERROR_MESSAGES.BALANCE_NOT_FOUND,
    429: BALANCE_ERROR_MESSAGES.BALANCE_OPEN_FINANCE_RATE_LIMIT,
    500: BALANCE_ERROR_MESSAGES.BALANCE_FETCH_ERROR,
    502: BALANCE_ERROR_MESSAGES.BALANCE_CONNECTOR_UNAVAILABLE,
  }
  return byStatus[error.statusCode] ?? "Saldo em tempo real indisponível."
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * Busca o saldo em tempo real de uma conta de domínio (GET
 * /accounts/{id}/balance) sem disparar sync completo. Persiste o valor e o
 * horário do conector. Em falha, faz fallback elegante ao saldo salvo e
 * comunica o motivo. Só funciona para contas do provedor Pluggy.
 */
export async function refreshDomainAccountBalance(
  domainAccountId: string,
): Promise<RealtimeBalanceResult> {
  const account = await prisma.domainAccount.findUnique({
    where: { id: domainAccountId },
    select: {
      id: true,
      sourceProvider: true,
      sourceExternalId: true,
      balance: true,
      currencyCode: true,
    },
  })

  if (!account) {
    throw new Error("Conta não encontrada")
  }

  const cachedBalance = account.balance ? Number(account.balance.toString()) : null

  if (account.sourceProvider !== SourceProvider.PLUGGY) {
    return {
      accountId: domainAccountId,
      ok: false,
      balance: null,
      currencyCode: account.currencyCode,
      updateDateTime: null,
      effectiveBalance: cachedBalance,
      source: "cached",
      status: "UNSUPPORTED",
      message: "Saldo em tempo real só está disponível para contas Pluggy.",
    }
  }

  try {
    const payload = (await fetchAccountBalance(account.sourceExternalId)) as
      | Record<string, unknown>
      | null

    const balance = toNumber(payload?.balance)
    const currencyCode =
      typeof payload?.currencyCode === "string"
        ? payload.currencyCode
        : account.currencyCode
    const updateDateTime =
      typeof payload?.updateDateTime === "string"
        ? payload.updateDateTime
        : new Date().toISOString()

    await prisma.domainAccount.update({
      where: { id: domainAccountId },
      data: {
        realtimeBalance:
          balance !== null ? new Prisma.Decimal(balance) : undefined,
        realtimeBalanceAt: new Date(updateDateTime),
        realtimeBalanceStatus: "OK",
        // Reflete no saldo principal para as telas que ainda leem `balance`.
        balance: balance !== null ? new Prisma.Decimal(balance) : undefined,
      },
    })

    return {
      accountId: domainAccountId,
      ok: true,
      balance,
      currencyCode,
      updateDateTime,
      effectiveBalance: balance ?? cachedBalance,
      source: "realtime",
      status: "OK",
    }
  } catch (error) {
    const message =
      error instanceof PluggyApiError
        ? messageForBalanceError(error)
        : "Saldo em tempo real indisponível."
    const status =
      error instanceof PluggyApiError
        ? (error.code ?? `HTTP_${error.statusCode}`)
        : "ERROR"

    await prisma.domainAccount
      .update({
        where: { id: domainAccountId },
        data: { realtimeBalanceStatus: status },
      })
      .catch(() => {})

    // Fallback elegante: devolve o saldo salvo com a razão da falha.
    return {
      accountId: domainAccountId,
      ok: false,
      balance: null,
      currencyCode: account.currencyCode,
      updateDateTime: null,
      effectiveBalance: cachedBalance,
      source: "cached",
      status,
      message,
    }
  }
}
