import { NextResponse } from "next/server"

import {
  fetchAccounts,
  fetchItem,
  getApiKey,
  getPluggyErrorDetails,
} from "@/lib/integrations/pluggy"
import { deriveInstitutionFromNames } from "@/lib/domain/utils"
import { PLUGGY_CONNECTOR_MAPPING, getPluggyLogoUrl } from "@/lib/constants/pluggy-connectors"
import {
  listStoredPluggyItems,
  savePluggyItem,
  updateStoredPluggyItem,
} from "@/lib/pluggy-items"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type PluggyAccountLike = { name?: string | null }

function extractAccountNames(payload: unknown) {
  if (!payload || typeof payload !== "object") return []
  const results = (payload as { results?: unknown[] }).results
  if (!Array.isArray(results)) return []
  return results
    .map((account) => ((account as PluggyAccountLike).name ?? "").trim())
    .filter(Boolean)
}

export async function GET() {
  const items = await listStoredPluggyItems()

  // Titular, consentimento e saúde do conector: contexto que a tela /connect
  // precisa para explicar por que uma conexão está atrasada sem o usuário ter de
  // adivinhar.
  const [identities, consents, connectorStatuses] = await Promise.all([
    prisma.pluggyIdentityRecord.findMany({
      select: { itemExternalId: true, fullName: true, documentNumber: true },
    }),
    prisma.pluggyConsentRecord.findMany({
      where: { expiresAt: { not: null } },
      orderBy: { expiresAt: "asc" },
      select: { itemExternalId: true, status: true, expiresAt: true },
    }),
    prisma.pluggyConnectorStatus.findMany(),
  ])

  const identityByItem = new Map(
    identities.map((identity) => [identity.itemExternalId, identity]),
  )
  // `orderBy` crescente + primeiro a vencer ganha.
  const consentByItem = new Map<string, (typeof consents)[number]>()
  for (const consent of consents) {
    if (!consentByItem.has(consent.itemExternalId)) {
      consentByItem.set(consent.itemExternalId, consent)
    }
  }
  const statusByConnector = new Map(
    connectorStatuses.map((status) => [status.connectorId, status]),
  )

  // Autentica uma vez antes de consultar cada item. Credencial global inválida
  // não deve produzir uma exceção e um log para cada banco conectado.
  try {
    await getApiKey()
  } catch (error) {
    const details = getPluggyErrorDetails(error)
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        consentExpiresAt:
          consentByItem.get(item.pluggyItemId)?.expiresAt ?? item.consentExpiresAt,
        consentStatus: consentByItem.get(item.pluggyItemId)?.status ?? null,
        owner: identityByItem.get(item.pluggyItemId) ?? null,
        connectorStatus:
          item.connectorId !== null
            ? (statusByConnector.get(item.connectorId)?.status ?? null)
            : null,
      })),
      providerIssue: details,
    })
  }

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      try {
        const liveItem = await fetchItem(item.pluggyItemId)
        
        // Try to derive real name if currently generic
        let connectorName: string | null | undefined = liveItem?.connector?.name
        let connectorId: number | null | undefined = liveItem?.connector?.id
        let imageUrl: string | null | undefined = liveItem?.connector?.imageUrl

        if (!connectorName || ["Pluggy", "MeuPluggy", "PLUGGY"].includes(connectorName)) {
           const accountsPayload = await fetchAccounts({ itemId: item.pluggyItemId })
           const derived = deriveInstitutionFromNames(extractAccountNames(accountsPayload))
           if (derived) {
             connectorName = derived
             // Look up real ID and logo in our dictionary
             const mappedId = PLUGGY_CONNECTOR_MAPPING[derived]
             if (mappedId) {
               connectorId = mappedId
               imageUrl = getPluggyLogoUrl(mappedId)
             }
           }
        }

        await updateStoredPluggyItem({
          itemId: item.pluggyItemId,
          connectorId: connectorId ?? null,
          connectorName: connectorName ?? null,
          status: liveItem?.status ?? null,
          imageUrl: imageUrl ?? null,
        })

        const effectiveConnectorId = connectorId ?? item.connectorId

        return {
          ...item,
          connectorId: effectiveConnectorId,
          connectorName: connectorName ?? item.connectorName,
          status: liveItem?.status ?? item.status,
          // executionStatus vivo (SUCCESS/PARTIAL_SUCCESS/ERROR/null=em curso)
          // e horário da última atualização do item na instituição.
          executionStatus: liveItem?.executionStatus ?? item.executionStatus,
          lastUpdatedAt: liveItem?.lastUpdatedAt ?? liveItem?.updatedAt ?? null,
          // `nextAutoSyncAt` é o auto-sync da própria Pluggy: o momento mínimo em
          // que ela buscará dado novo e disparará o webhook.
          nextAutoSyncAt: liveItem?.nextAutoSyncAt ?? item.nextAutoSyncAt,
          consentExpiresAt:
            liveItem?.consentExpiresAt ??
            consentByItem.get(item.pluggyItemId)?.expiresAt ??
            item.consentExpiresAt,
          consentStatus: consentByItem.get(item.pluggyItemId)?.status ?? null,
          owner: identityByItem.get(item.pluggyItemId) ?? null,
          connectorStatus:
            effectiveConnectorId !== null
              ? (statusByConnector.get(effectiveConnectorId)?.status ?? null)
              : null,
          syncError: item.syncError,
          lastSyncedAt: item.lastSyncedAt,
          imageUrl: imageUrl ?? item.imageUrl,
        }
      } catch (err) {
        console.warn(`[pluggy/items] failed to sync item ${item.pluggyItemId}:`, err)
        return item
      }
    })
  )

  return NextResponse.json({ items: enrichedItems, providerIssue: null })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        itemId?: string
        connectorId?: number | null
        connectorName?: string | null
        status?: string | null
        imageUrl?: string | null
      }
    | null

  if (!body?.itemId) {
    return NextResponse.json(
      { error: "itemId e obrigatorio" },
      { status: 400 }
    )
  }

  let finalConnectorName: string | null | undefined = body.connectorName
  let finalConnectorId: number | null | undefined = body.connectorId
  let finalImageUrl: string | null | undefined = body.imageUrl

  // If the name is generic, try to resolve the real institution from accounts
  if (!finalConnectorName || ["Pluggy", "MeuPluggy", "PLUGGY"].includes(finalConnectorName)) {
    try {
      const accountsPayload = await fetchAccounts({ itemId: body.itemId })
      const accountNames = extractAccountNames(accountsPayload)
      const derived = deriveInstitutionFromNames(accountNames)
      if (derived) {
        finalConnectorName = derived
        const mappedId = PLUGGY_CONNECTOR_MAPPING[derived]
        if (mappedId) {
          finalConnectorId = mappedId
          finalImageUrl = getPluggyLogoUrl(mappedId)
        }
      }
    } catch (err) {
      console.warn(`[pluggy/items] failed to derive name for ${body.itemId}:`, err)
    }
  }

  const item = await savePluggyItem({
    itemId: body.itemId,
    connectorId: finalConnectorId ?? null,
    connectorName: finalConnectorName ?? null,
    status: body.status ?? null,
    imageUrl: finalImageUrl ?? null,
  })

  return NextResponse.json(item)
}
