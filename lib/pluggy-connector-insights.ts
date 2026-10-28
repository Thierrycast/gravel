import { PluggyApiError, fetchConnector } from "@/lib/integrations/pluggy"

/**
 * Incidente ativo de uma instituição, como a Pluggy publica no status page.
 * É sobre o banco, não sobre a conexão do usuário: serve para explicar dado
 * atrasado ou faltando sem o usuário achar que o app quebrou.
 */
export type ConnectorIncident = {
  title: string
  type: string
  kind: "INCIDENT" | "MAINTENANCE"
  severity: "DEGRADED" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "MAINTENANCE"
  state: string
  startedAt: string
  url: string | null
}

export type ConnectorInsight = {
  connectorId: number
  /** Subprodutos Open Finance (ex.: `INVESTMENTS:FUNDS`). Vazio em conector direto. */
  productCoverage: string[]
  /** Ordenados do pior para o melhor, como a Pluggy entrega. */
  incidents: ConnectorIncident[]
}

const SEVERITIES = new Set(["DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"])
/** Só incidentes do produto de dados interessam a um app de leitura. */
const RELEVANT_PRODUCTS = new Set(["dados", "infra"])

function asString(value: unknown, max = 200): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null
}

/** Só aceita link do status page da Pluggy: o campo vai parar num `href`. */
function safeStatusUrl(value: unknown): string | null {
  const raw = asString(value, 500)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && url.hostname.endsWith("pluggy.ai") ? url.toString() : null
  } catch {
    return null
  }
}

export function parseConnectorInsight(connectorId: number, payload: unknown): ConnectorInsight {
  const connector = (payload && typeof payload === "object" ? payload : {}) as {
    productCoverage?: unknown
    health?: { incidents?: unknown }
  }

  const productCoverage = Array.isArray(connector.productCoverage)
    ? connector.productCoverage
        .map((entry) => asString(entry, 80))
        .filter((entry): entry is string => entry !== null)
    : []

  const rawIncidents = Array.isArray(connector.health?.incidents) ? connector.health.incidents : []
  const incidents: ConnectorIncident[] = []
  for (const raw of rawIncidents) {
    if (!raw || typeof raw !== "object") continue
    const incident = raw as Record<string, unknown>
    const title = asString(incident.title)
    const severity = asString(incident.severity)
    if (!title || !severity || !SEVERITIES.has(severity)) continue
    const product = asString(incident.product)
    if (product && !RELEVANT_PRODUCTS.has(product)) continue
    incidents.push({
      title,
      type: asString(incident.type, 60) ?? "OTHER",
      kind: incident.kind === "MAINTENANCE" ? "MAINTENANCE" : "INCIDENT",
      severity: severity as ConnectorIncident["severity"],
      state: asString(incident.state, 40) ?? "INVESTIGATING",
      startedAt: asString(incident.startedAt, 40) ?? "",
      url: safeStatusUrl(incident.url),
    })
  }

  return { connectorId, productCoverage, incidents }
}

/**
 * Incidentes mudam em minutos; cobertura quase nunca. Cinco minutos evitam uma
 * chamada à Pluggy por banco a cada carregamento de tela sem esconder um
 * incidente novo por muito tempo.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<number, { at: number; value: ConnectorInsight }>()

export async function getConnectorInsight(connectorId: number): Promise<ConnectorInsight | null> {
  const hit = cache.get(connectorId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
  try {
    const value = parseConnectorInsight(connectorId, await fetchConnector(connectorId))
    cache.set(connectorId, { at: Date.now(), value })
    return value
  } catch (error) {
    // Conector direto descontinuado (ids antigos do mapeamento do MeuPluggy):
    // não existe mais no catálogo, então não há cobertura nem incidente a
    // mostrar. Cacheia o vazio para não repetir a chamada a cada tela.
    if (error instanceof PluggyApiError && error.statusCode === 404) {
      const value = { connectorId, productCoverage: [], incidents: [] }
      cache.set(connectorId, { at: Date.now(), value })
      return value
    }
    console.warn(`[pluggy/connectors] failed to fetch connector ${connectorId}:`, error)
    // Melhor um dado de alguns minutos atrás do que nenhum.
    return hit?.value ?? null
  }
}

export async function getConnectorInsights(connectorIds: Iterable<number>) {
  const ids = Array.from(new Set(connectorIds))
  const results = await Promise.all(ids.map((id) => getConnectorInsight(id)))
  return new Map(
    results
      .filter((insight): insight is ConnectorInsight => insight !== null)
      .map((insight) => [insight.connectorId, insight]),
  )
}

const COVERAGE_LABELS: Record<string, string> = {
  ACCOUNTS: "Contas",
  CREDIT_CARDS: "Cartões",
  CREDIT_OPERATIONS: "Crédito",
  INVESTMENTS: "Investimentos",
  RESOURCES: "Recursos",
  CUSTOMERS: "Cadastro",
  REGISTRATION: "Cadastro",
  EXCHANGES: "Câmbio",
}

/** `INVESTMENTS:FUNDS` → família legível, para agrupar na UI. */
export function coverageFamily(entry: string): string {
  const family = entry.split(":")[0] ?? entry
  return COVERAGE_LABELS[family] ?? family
}
