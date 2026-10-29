import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/integrations/pluggy", () => ({
  fetchConnector: vi.fn(),
  PluggyApiError: class PluggyApiError extends Error {},
}))

import { coverageFamily, parseConnectorInsight } from "@/lib/pluggy-connector-insights"

describe("parseConnectorInsight", () => {
  it("lê cobertura e incidentes ativos do conector", () => {
    const insight = parseConnectorInsight(201, {
      productCoverage: ["ACCOUNTS:CHECKING", "INVESTMENTS:FUNDS", 42],
      health: {
        status: "ONLINE",
        incidents: [
          {
            title: "Transações não retornadas",
            type: "TRANSACTIONS_MISSING",
            product: "dados",
            kind: "INCIDENT",
            severity: "PARTIAL_OUTAGE",
            state: "IDENTIFIED",
            startedAt: "2026-10-28T10:00:00Z",
            url: "https://status.pluggy.ai/incidents/abc",
          },
        ],
      },
    })

    expect(insight.productCoverage).toEqual(["ACCOUNTS:CHECKING", "INVESTMENTS:FUNDS"])
    expect(insight.incidents).toHaveLength(1)
    expect(insight.incidents[0]).toMatchObject({
      severity: "PARTIAL_OUTAGE",
      url: "https://status.pluggy.ai/incidents/abc",
    })
  })

  it("ignora incidentes de outros produtos, severidade inválida e links de fora", () => {
    const insight = parseConnectorInsight(1, {
      health: {
        incidents: [
          { title: "Pix fora", product: "pis", severity: "MAJOR_OUTAGE" },
          { title: "Sem severidade", product: "dados" },
          {
            title: "Link estranho",
            product: "dados",
            severity: "DEGRADED",
            url: "javascript:alert(1)",
          },
        ],
      },
    })

    expect(insight.incidents.map((incident) => incident.title)).toEqual(["Link estranho"])
    expect(insight.incidents[0].url).toBeNull()
  })

  it("conector direto não tem cobertura nem incidentes", () => {
    expect(parseConnectorInsight(2, { health: { status: "ONLINE" } })).toEqual({
      connectorId: 2,
      productCoverage: [],
      incidents: [],
    })
  })
})

describe("coverageFamily", () => {
  it("traduz a família do subproduto", () => {
    expect(coverageFamily("INVESTMENTS:FUNDS")).toBe("Investimentos")
    expect(coverageFamily("UNKNOWN:X")).toBe("UNKNOWN")
  })
})
