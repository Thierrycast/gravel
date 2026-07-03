import { Prisma } from "@prisma/client"

import { getApiKey } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

const ENRICHMENT_BASE =
  process.env.PLUGGY_ENRICHMENT_API_BASE ?? "https://enrichment-api.pluggy.ai"

function getHeaderName() {
  return process.env.PLUGGY_API_KEY_HEADER ?? "X-API-KEY"
}

/**
 * POST na Enrichment API da Pluggy (serviço separado da API principal). Não
 * expõe a API key ao frontend — sempre roda no backend.
 */
async function enrichmentPost<T>(path: string, body: unknown): Promise<T> {
  const apiKey = await getApiKey()
  const response = await fetch(`${ENRICHMENT_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(
      `Pluggy enrichment ${path} error: ${response.status} ${text}`.trim(),
    )
  }
  return response.json() as Promise<T>
}

// ── Pagamentos recorrentes ────────────────────────────────────────────────

type RecurringPaymentApi = {
  description: string
  averageAmount: number
  occurrences: string[]
  regularityScore: number
  currencyCode?: string | null
  category?: string | null
  destination?: string | null
  firstDate?: string | null
  lastDate?: string | null
}

function toDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Busca as recorrências detectadas pela Pluggy para um item e persiste. Cruza
 * os `occurrences` (IDs de transações do provedor) com as transações reais
 * para saber a direção e ligar aos detalhes. Preserva decisões manuais do
 * usuário (userStatus CONFIRMED/HIDDEN não é rebaixado a SUGGESTED).
 */
export async function syncItemRecurringPayments(itemExternalId: string) {
  const payload = await enrichmentPost<{
    recurringPayments?: RecurringPaymentApi[]
  }>("/recurring-payments", { itemId: itemExternalId })

  const recurring = payload.recurringPayments ?? []
  const now = new Date()
  let upserted = 0

  for (const entry of recurring) {
    // averageAmount negativo = despesa; positivo = receita.
    const direction = entry.averageAmount < 0 ? "EXPENSE" : "INCOME"
    const occurrences = Array.isArray(entry.occurrences)
      ? entry.occurrences
      : []
    // Chave estável do registro por item+descrição+direção.
    const externalId = `${itemExternalId}:${direction}:${entry.description}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()

    // Cruza occurrences com transações reais (sourceExternalId da Pluggy).
    const matched = occurrences.length
      ? await prisma.domainTransaction.findMany({
          where: { sourceExternalId: { in: occurrences } },
          select: { id: true, occurredAt: true },
          orderBy: { occurredAt: "asc" },
        })
      : []
    const firstDate =
      toDate(entry.firstDate) ?? matched[0]?.occurredAt ?? null
    const lastDate =
      toDate(entry.lastDate) ?? matched.at(-1)?.occurredAt ?? null

    const existing = await prisma.pluggyRecurringPayment.findUnique({
      where: { externalId },
    })

    await prisma.pluggyRecurringPayment.upsert({
      where: { externalId },
      update: {
        itemExternalId,
        description: entry.description,
        averageAmount: new Prisma.Decimal(entry.averageAmount),
        currencyCode: entry.currencyCode ?? undefined,
        occurrences: occurrences.length,
        regularityScore:
          typeof entry.regularityScore === "number"
            ? new Prisma.Decimal(entry.regularityScore)
            : undefined,
        categoryName: entry.category ?? undefined,
        direction,
        firstDate: firstDate ?? undefined,
        lastDate: lastDate ?? undefined,
        destinationName: entry.destination ?? undefined,
        transactionIdsJson: JSON.stringify(matched.map((t) => t.id)),
        payloadJson: JSON.stringify(entry),
        // Não rebaixa uma decisão manual do usuário.
        userStatus: existing?.userStatus ?? "SUGGESTED",
        fetchedAt: now,
      },
      create: {
        itemExternalId,
        externalId,
        description: entry.description,
        averageAmount: new Prisma.Decimal(entry.averageAmount),
        currencyCode: entry.currencyCode ?? null,
        occurrences: occurrences.length,
        regularityScore:
          typeof entry.regularityScore === "number"
            ? new Prisma.Decimal(entry.regularityScore)
            : null,
        categoryName: entry.category ?? null,
        direction,
        firstDate,
        lastDate,
        destinationName: entry.destination ?? null,
        transactionIdsJson: JSON.stringify(matched.map((t) => t.id)),
        payloadJson: JSON.stringify(entry),
        fetchedAt: now,
      },
    })
    upserted += 1
  }

  return { itemExternalId, detected: recurring.length, upserted }
}

// ── Behavior analysis ─────────────────────────────────────────────────────

type BehaviorApi = {
  behaviors?: Record<string, boolean>
  metrics?: Record<string, { spending?: number; transactionCount?: number }>
}

/**
 * Busca e persiste o perfil comportamental do item (snapshot). Guardamos o
 * payload inteiro; a UI lê sem recalcular.
 */
export async function syncItemBehaviorAnalysis(itemExternalId: string) {
  const payload = await enrichmentPost<BehaviorApi>("/behavior-analysis", {
    itemId: itemExternalId,
  })

  await prisma.pluggyBehaviorAnalysis.upsert({
    where: { itemExternalId },
    update: {
      signalsJson: payload.behaviors ? JSON.stringify(payload.behaviors) : null,
      categoriesJson: payload.metrics ? JSON.stringify(payload.metrics) : null,
      payloadJson: JSON.stringify(payload),
      fetchedAt: new Date(),
    },
    create: {
      itemExternalId,
      signalsJson: payload.behaviors ? JSON.stringify(payload.behaviors) : null,
      categoriesJson: payload.metrics ? JSON.stringify(payload.metrics) : null,
      payloadJson: JSON.stringify(payload),
    },
  })

  return {
    itemExternalId,
    signals: payload.behaviors ? Object.keys(payload.behaviors).length : 0,
  }
}

/** Roda os dois enriquecimentos por item para todos os itens armazenados. */
export async function runItemEnrichment(itemExternalId?: string | null) {
  const items = itemExternalId
    ? [{ pluggyItemId: itemExternalId }]
    : await prisma.pluggyItem.findMany({ select: { pluggyItemId: true } })

  const results: Array<{ itemId: string; recurring?: number; behavior?: number; error?: string }> =
    []
  for (const item of items) {
    try {
      const recurring = await syncItemRecurringPayments(item.pluggyItemId)
      let behaviorSignals = 0
      try {
        const behavior = await syncItemBehaviorAnalysis(item.pluggyItemId)
        behaviorSignals = behavior.signals
      } catch (error) {
        console.warn(
          `[enrichment] behavior-analysis falhou para ${item.pluggyItemId}: ${error instanceof Error ? error.message : error}`,
        )
      }
      results.push({
        itemId: item.pluggyItemId,
        recurring: recurring.upserted,
        behavior: behaviorSignals,
      })
    } catch (error) {
      results.push({
        itemId: item.pluggyItemId,
        error: error instanceof Error ? error.message : "erro desconhecido",
      })
    }
  }
  return results
}
