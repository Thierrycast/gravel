import { fetchConsents, fetchIdentity } from "@/lib/integrations/pluggy"
import { prisma } from "@/lib/prisma"

/**
 * Produtos "de perfil" da Pluggy que não fazem parte do sync transacional:
 * identidade do titular e consentimentos do Open Finance.
 *
 * Ambos mudam raramente (identidade quase nunca; consentimento a cada
 * renovação), então rodam na reconciliação diária, não a cada sync.
 */

function toDate(value: unknown) {
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

/**
 * `GET /identity?itemId=` — nome, documento e contatos do titular. Vários
 * conectores não oferecem o produto; nesse caso a chamada devolve 404/vazio e
 * isso não é erro.
 */
export async function syncItemIdentity(itemExternalId: string) {
  const payload = (await fetchIdentity(itemExternalId).catch(() => null)) as Record<
    string,
    unknown
  > | null

  const externalId = toStringOrNull(payload?.id)
  if (!payload || !externalId) {
    return { synced: false as const, reason: "unavailable" as const }
  }

  // `phoneNumbers` e `emails` vêm como listas; guardamos o primeiro para exibir
  // e o payload inteiro para quem precisar do resto.
  const phones = Array.isArray(payload.phoneNumbers) ? payload.phoneNumbers : []
  const emails = Array.isArray(payload.emails) ? payload.emails : []
  const firstPhone = phones[0] as Record<string, unknown> | undefined
  const firstEmail = emails[0] as Record<string, unknown> | undefined

  const data = {
    itemExternalId,
    fullName: toStringOrNull(payload.fullName),
    documentNumber: toStringOrNull(payload.documentNumber),
    document: toStringOrNull(payload.document),
    documentType: toStringOrNull(payload.documentType),
    birthDate: toDate(payload.birthDate),
    email: toStringOrNull(firstEmail?.value) ?? toStringOrNull(payload.email),
    phoneNumber: toStringOrNull(firstPhone?.value),
    payloadJson: JSON.stringify(payload),
    providerUpdatedAt: toDate(payload.updatedAt),
  }

  await prisma.pluggyIdentityRecord.upsert({
    where: { itemExternalId },
    update: data,
    create: { externalId, ...data },
  })

  return { synced: true as const, fullName: data.fullName }
}

/**
 * `GET /consents?itemId=` — consentimentos e suas validades. A data de
 * expiração alimenta o aviso de "renove antes de perder o acesso"; sem isso o
 * usuário só descobre quando a sincronização já parou.
 */
export async function syncItemConsents(itemExternalId: string) {
  const payload = (await fetchConsents({ itemId: itemExternalId }).catch(
    () => null,
  )) as { results?: Record<string, unknown>[] } | null

  const consents = Array.isArray(payload?.results) ? payload.results : []
  if (consents.length === 0) {
    return { synced: 0, soonestExpiresAt: null as Date | null }
  }

  let soonestExpiresAt: Date | null = null
  let synced = 0

  for (const consent of consents) {
    const externalId = toStringOrNull(consent.id)
    if (!externalId) continue

    const expiresAt = toDate(consent.expiresAt)
    if (expiresAt && (!soonestExpiresAt || expiresAt < soonestExpiresAt)) {
      soonestExpiresAt = expiresAt
    }

    const data = {
      itemExternalId,
      status: toStringOrNull(consent.status),
      expiresAt,
      createdAtSource: toDate(consent.createdAt),
      products: Array.isArray(consent.products)
        ? consent.products.map(String).join(",")
        : null,
      payloadJson: JSON.stringify(consent),
    }

    await prisma.pluggyConsentRecord.upsert({
      where: { externalId },
      update: data,
      create: { externalId, ...data },
    })
    synced += 1
  }

  // Espelha no item para a UI e os alertas não precisarem cruzar tabelas.
  if (soonestExpiresAt) {
    await prisma.pluggyItem
      .update({
        where: { pluggyItemId: itemExternalId },
        data: { consentExpiresAt: soonestExpiresAt },
      })
      .catch(() => {
        // Item pode não existir localmente.
      })
  }

  return { synced, soonestExpiresAt }
}

/**
 * Roda identidade + consentimentos de todos os items conectados. Best-effort:
 * uma falha num item não impede os outros.
 */
export async function syncAllItemProfiles() {
  const items = await prisma.pluggyItem.findMany({
    where: { deletedAt: null },
    select: { pluggyItemId: true },
  })

  const results: Array<{
    itemId: string
    identity: boolean
    consents: number
    error?: string
  }> = []

  for (const item of items) {
    try {
      const [identity, consents] = await Promise.all([
        syncItemIdentity(item.pluggyItemId),
        syncItemConsents(item.pluggyItemId),
      ])
      results.push({
        itemId: item.pluggyItemId,
        identity: identity.synced,
        consents: consents.synced,
      })
    } catch (error) {
      results.push({
        itemId: item.pluggyItemId,
        identity: false,
        consents: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}
