import { describe, expect, it } from "vitest"

import {
  CHECKPOINT_OVERLAP_MS,
  MAX_HISTORY_DAYS,
  resolveTransactionWindow,
} from "./transaction-window"

const NOW = Date.parse("2026-08-07T12:00:00.000Z")

describe("resolveTransactionWindow", () => {
  // A API rejeita `createdAtFrom` junto com `dateFrom` — nenhum modo pode
  // devolver os dois.
  it("nunca combina createdAtFrom com dateFrom", () => {
    const cases = [
      { createdAtFrom: "2026-08-01T00:00:00.000Z" },
      { full: true },
      { watermark: new Date(NOW) },
      { lookbackDays: 30 },
    ]

    for (const input of cases) {
      const window = resolveTransactionWindow({ ...input, now: NOW })
      expect(
        window.createdAtFrom !== undefined && window.dateFrom !== undefined,
      ).toBe(false)
      expect(window.createdAtFrom ?? window.dateFrom).toBeDefined()
    }
  })

  it("respeita um createdAtFrom explícito (webhook transactions/created)", () => {
    const window = resolveTransactionWindow({
      createdAtFrom: "2026-08-06T02:28:26.738Z",
      // Mesmo com watermark e full presentes, o explícito ganha.
      full: true,
      watermark: new Date(NOW),
      now: NOW,
    })

    expect(window.mode).toBe("explicit-createdAtFrom")
    expect(window.createdAtFrom).toBe("2026-08-06T02:28:26.738Z")
  })

  it("faz backfill de 12 meses por data de lançamento quando full", () => {
    const window = resolveTransactionWindow({ full: true, now: NOW })

    expect(window.mode).toBe("backfill")
    expect(window.dateFrom).toBe(
      new Date(NOW - MAX_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
    )
  })

  it("aplica a sobreposição de segurança ao ler do checkpoint", () => {
    const watermark = new Date("2026-08-06T00:00:00.000Z")
    const window = resolveTransactionWindow({ watermark, now: NOW })

    expect(window.mode).toBe("incremental")
    expect(window.createdAtFrom).toBe(
      new Date(watermark.getTime() - CHECKPOINT_OVERLAP_MS).toISOString(),
    )
    // A sobreposição precisa olhar para trás, nunca para frente.
    expect(Date.parse(window.createdAtFrom!)).toBeLessThan(watermark.getTime())
  })

  it("usa a janela de lookbackDays quando a conta ainda não tem checkpoint", () => {
    const window = resolveTransactionWindow({
      watermark: null,
      lookbackDays: 30,
      now: NOW,
    })

    expect(window.mode).toBe("window")
    expect(window.dateFrom).toBe(
      new Date(NOW - 30 * 86_400_000).toISOString().slice(0, 10),
    )
  })

  it("sem checkpoint e sem lookback configurado, busca o histórico máximo", () => {
    const window = resolveTransactionWindow({ now: NOW })

    expect(window.mode).toBe("window")
    expect(window.dateFrom).toBe(
      new Date(NOW - MAX_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10),
    )
  })
})
