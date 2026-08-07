import { timingSafeEqual } from "node:crypto"

/**
 * Parsing puro do payload de webhook da Pluggy e comparação do secret.
 *
 * Fica separado de `webhook-events.ts` de propósito: aqui não há Prisma nem
 * rede, então dá para testar cada formato de evento sem banco.
 */

/**
 * Payload normalizado de um evento de webhook da Pluggy.
 *
 * Atenção ao identificador: a Pluggy manda **`eventId`**. Alguns eventos
 * (`transactions/created`, `connector/status_updated`) também mandam um `id`,
 * mas `item/*` **não** — exigir `id` fazia todo evento de item ser rejeitado.
 */
export type PluggyWebhookPayload = {
  event: string
  eventId: string
  itemId?: string | null
  accountId?: string | null
  connectorId?: string | null
  triggeredBy?: string | null
  clientUserId?: string | null
  /** Sempre presente (lista vazia quando o evento não traz ids). */
  transactionIds: string[]
  transactionsCreatedAtFrom?: string | null
  createdTransactionsLink?: string | null
  createdTransactionsLinkV2?: string | null
  error?: { code?: string; message?: string; parameter?: string } | null
  data?: { status?: string } | null
  raw: Record<string, unknown>
}

export class WebhookPayloadError extends Error {}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

/**
 * Extrai e valida o payload. Só `event` e o id do evento são obrigatórios —
 * cada tipo de evento traz um subconjunto diferente de campos.
 */
export function parseWebhookPayload(body: unknown): PluggyWebhookPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WebhookPayloadError("Corpo do webhook não é um objeto JSON")
  }
  const raw = body as Record<string, unknown>

  const event = asString(raw.event)
  if (!event) {
    throw new WebhookPayloadError("Campo `event` ausente")
  }

  // `eventId` é o nome oficial; `id` entra como fallback tolerante.
  const eventId = asString(raw.eventId) ?? asString(raw.id)
  if (!eventId) {
    throw new WebhookPayloadError("Campo `eventId` ausente")
  }

  const transactionIds = Array.isArray(raw.transactionIds)
    ? raw.transactionIds.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : []

  const errorRaw = raw.error as Record<string, unknown> | null | undefined
  const dataRaw = raw.data as Record<string, unknown> | null | undefined

  return {
    event,
    eventId,
    itemId: asString(raw.itemId),
    accountId: asString(raw.accountId),
    connectorId: asString(raw.connectorId),
    triggeredBy: asString(raw.triggeredBy),
    clientUserId: asString(raw.clientUserId),
    transactionIds,
    transactionsCreatedAtFrom: asString(raw.transactionsCreatedAtFrom),
    createdTransactionsLink: asString(raw.createdTransactionsLink),
    createdTransactionsLinkV2: asString(raw.createdTransactionsLinkV2),
    error: errorRaw
      ? {
          code: asString(errorRaw.code) ?? undefined,
          message: asString(errorRaw.message) ?? undefined,
          parameter: asString(errorRaw.parameter) ?? undefined,
        }
      : null,
    data: dataRaw ? { status: asString(dataRaw.status) ?? undefined } : null,
    raw,
  }
}

/**
 * Os links de `transactions/created` já vêm com o `createdAtFrom` embutido, o
 * que permite buscar exatamente o lote novo em vez de reler a conta inteira.
 */
export function extractCreatedAtFrom(link?: string | null) {
  if (!link) return null
  try {
    return new URL(link).searchParams.get("createdAtFrom")
  } catch {
    return null
  }
}

/**
 * Compara segredos em tempo constante. Comprimentos diferentes ainda consomem
 * uma comparação de tamanho igual para não vazar o tamanho pelo tempo.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}
