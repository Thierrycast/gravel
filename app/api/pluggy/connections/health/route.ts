import { jsonError, jsonOk } from "@/lib/core/http"
import { getConnectorInsights } from "@/lib/pluggy-connector-insights"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/** A partir de quantos dias antes do vencimento o consentimento vira aviso. */
const CONSENT_WARNING_DAYS = 15

/** Por quanto tempo um status de conector recebido por webhook continua valendo. */
const CONNECTOR_STATUS_TTL_MS = 24 * 60 * 60 * 1000

/** Status de item que exigem o usuário passar pelo Connect de novo. */
const NEEDS_ACTION_STATUSES = new Set([
  "WAITING_USER_INPUT",
  "WAITING_USER_ACTION",
  "LOGIN_ERROR",
  "DELETED",
])

export type ConnectionAlert = {
  kind:
    | "needs-action"
    | "consent-expiring"
    | "connector-unstable"
    | "connector-incident"
    | "stale"
  severity: "warning" | "critical"
  itemId: string | null
  institution: string
  message: string
  /** Dias até o consentimento expirar, quando aplicável. */
  daysLeft?: number
  /** Página do incidente no status page da Pluggy. */
  url?: string | null
}

/**
 * Problemas de conexão que o usuário precisa resolver — nenhum deles se conserta
 * com "tentar sincronizar de novo", então ficam separados do banner de falha de
 * sync (que oferece retry).
 */
export async function GET() {
  try {
    const [items, connectors] = await Promise.all([
      prisma.pluggyItem.findMany({
        select: {
          pluggyItemId: true,
          connectorId: true,
          connectorName: true,
          status: true,
          syncError: true,
          consentExpiresAt: true,
          lastUpdatedAt: true,
          nextAutoSyncAt: true,
          deletedAt: true,
        },
      }),
      // Status vem de webhook: se os webhooks param, o último "instável" ficaria
      // na tela para sempre (o do Nubank ficou de 09/08 a 28/10/2026). Só vale
      // o que foi observado nas últimas 24 h.
      prisma.pluggyConnectorStatus.findMany({
        where: {
          status: { in: ["UNSTABLE", "OFFLINE"] },
          updatedAt: { gte: new Date(Date.now() - CONNECTOR_STATUS_TTL_MS) },
        },
      }),
    ])

    const now = Date.now()
    const alerts: ConnectionAlert[] = []

    for (const item of items) {
      const institution = item.connectorName ?? "Instituição"

      if (item.deletedAt || NEEDS_ACTION_STATUSES.has(item.status ?? "")) {
        alerts.push({
          kind: "needs-action",
          severity: "critical",
          itemId: item.pluggyItemId,
          institution,
          message:
            item.syncError ??
            "A conexão precisa ser refeita para voltar a sincronizar.",
        })
        continue
      }

      if (item.consentExpiresAt) {
        const daysLeft = Math.ceil(
          (item.consentExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000),
        )
        if (daysLeft <= CONSENT_WARNING_DAYS) {
          alerts.push({
            kind: "consent-expiring",
            severity: daysLeft <= 3 ? "critical" : "warning",
            itemId: item.pluggyItemId,
            institution,
            daysLeft,
            message:
              daysLeft <= 0
                ? "O consentimento do Open Finance expirou. Reconecte para voltar a receber dados."
                : `O consentimento do Open Finance expira em ${daysLeft} dia(s). Renove antes de perder o acesso.`,
          })
        }
      }
    }

    const affectedConnectorIds = new Set(
      items.map((item) => item.connectorId).filter((id): id is number => id !== null),
    )

    for (const connector of connectors) {
      if (!affectedConnectorIds.has(connector.connectorId)) continue
      alerts.push({
        kind: "connector-unstable",
        severity: connector.status === "OFFLINE" ? "critical" : "warning",
        itemId: null,
        institution: connector.name ?? `Conector ${connector.connectorId}`,
        message:
          connector.status === "OFFLINE"
            ? "A instituição está fora do ar. Não é problema do app — os dados voltam quando ela voltar."
            : "A instituição está instável. Alguns dados podem atrasar.",
      })
    }

    // Incidentes do status page: o `health.status` do conector pode continuar
    // ONLINE com um incidente aberto (ex.: transações faltando), então isto não
    // duplica o aviso de instabilidade acima.
    const unstableIds = new Set(connectors.map((connector) => connector.connectorId))
    const nameByConnector = new Map(
      items
        .filter((item) => item.connectorId !== null && !item.deletedAt)
        .map((item) => [item.connectorId as number, item.connectorName]),
    )
    const insights = await getConnectorInsights(nameByConnector.keys())
    for (const [connectorId, insight] of insights) {
      const incident = insight.incidents[0]
      if (!incident) continue
      if (unstableIds.has(connectorId) && incident.kind !== "MAINTENANCE") continue
      const extra = insight.incidents.length > 1 ? ` (+${insight.incidents.length - 1})` : ""
      alerts.push({
        kind: "connector-incident",
        severity: incident.severity === "MAJOR_OUTAGE" ? "critical" : "warning",
        itemId: null,
        institution: nameByConnector.get(connectorId) ?? `Conector ${connectorId}`,
        message:
          incident.kind === "MAINTENANCE"
            ? `Manutenção na instituição: ${incident.title}${extra}.`
            : `Incidente na instituição: ${incident.title}${extra}. Não é problema do app.`,
        url: incident.url,
      })
    }

    const order = { critical: 0, warning: 1 } as const
    alerts.sort((a, b) => order[a.severity] - order[b.severity])

    return jsonOk({
      summary: {
        hasAlerts: alerts.length > 0,
        critical: alerts.filter((alert) => alert.severity === "critical").length,
      },
      results: { alerts },
    })
  } catch (error) {
    return jsonError(error)
  }
}
