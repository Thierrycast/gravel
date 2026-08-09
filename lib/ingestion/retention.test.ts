import { describe, expect, it } from "vitest"

import { RETENTION, retentionCutoffs } from "./retention"

const NOW = Date.parse("2026-08-09T12:00:00.000Z")

describe("retentionCutoffs", () => {
  // O banco só crescia: em 2026-08-08 o PluggyPayloadSnapshot tinha 3088 linhas
  // num app de uso pessoal, com o arquivo passando de 9 MB mais 5 MB de WAL.
  it("calcula o corte de cada tabela a partir da janela configurada", () => {
    const cutoffs = retentionCutoffs(NOW)

    expect(cutoffs.payloadSnapshots.getTime()).toBe(
      NOW - RETENTION.payloadSnapshotDays * 86_400_000,
    )
    expect(cutoffs.opsRuns.getTime()).toBe(
      NOW - RETENTION.opsRunDays * 86_400_000,
    )
    expect(cutoffs.webhookEvents.getTime()).toBe(
      NOW - RETENTION.webhookEventDays * 86_400_000,
    )
  })

  it("nunca devolve um corte no futuro", () => {
    for (const cutoff of Object.values(retentionCutoffs(NOW))) {
      expect(cutoff.getTime()).toBeLessThan(NOW)
    }
  })

  it("mantém o payload bruto por mais tempo que o log de operação", () => {
    // Snapshot serve para depurar um lançamento estranho meses depois; run e
    // evento são log, valem pouco depois de algumas semanas.
    expect(RETENTION.payloadSnapshotDays).toBeGreaterThan(RETENTION.opsRunDays)
    expect(RETENTION.payloadSnapshotDays).toBeGreaterThan(
      RETENTION.webhookEventDays,
    )
  })
})
