/**
 * Janelas de retenção das tabelas que crescem a cada sync.
 *
 * Sem poda o banco só cresce: em 2026-08-08 o `PluggyPayloadSnapshot` já tinha
 * 3088 linhas num app de uso pessoal, e o arquivo passava de 9 MB mais 5 MB de
 * WAL — num container com `mem_limit` de 320 MB e backup diário.
 *
 * As janelas são separadas de propósito. Snapshot é payload bruto, útil para
 * depurar um lançamento estranho meses depois; run e evento de webhook são log,
 * e valem pouco passadas algumas semanas.
 *
 * Puro e sem Prisma para ser testável — quem apaga é `runRetention` no scheduler.
 */
export const RETENTION = {
  payloadSnapshotDays: 90,
  opsRunDays: 30,
  webhookEventDays: 30,
} as const

export function retentionCutoffs(now = Date.now()) {
  const cutoff = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000)

  return {
    payloadSnapshots: cutoff(RETENTION.payloadSnapshotDays),
    opsRuns: cutoff(RETENTION.opsRunDays),
    webhookEvents: cutoff(RETENTION.webhookEventDays),
  }
}
