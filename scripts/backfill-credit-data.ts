/**
 * Backfill: sobe o `creditData` que já estava nos snapshots para o domínio.
 *
 * O limite do cartão chega em todo `GET /accounts` da Pluggy e sempre foi
 * gravado cru em `PluggyPayloadSnapshot` — só nunca subiu para
 * `PluggyAccountRecord` nem para `DomainAccount`, então a tela de contas não
 * tinha número para mostrar. Este script lê o snapshot mais recente de cada
 * conta e preenche os campos, sem chamar a Pluggy.
 *
 * Isso importa: ele roda **sem credencial**. Em 2026-09-10 o
 * `PLUGGY_CLIENT_SECRET` do lab estava com um placeholder e a API devolvia 401
 * — mesmo assim o histórico dos snapshots dá o limite de cada cartão.
 *
 * Uso: pnpm tsx --env-file=.env scripts/backfill-credit-data.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client"

import { extractCreditData } from "../lib/domain/credit"

const prisma = new PrismaClient()
const dryRun = process.argv.includes("--dry-run")

async function main() {
  const snapshots = await prisma.pluggyPayloadSnapshot.findMany({
    where: { resourceType: "account", payloadJson: { contains: "creditLimit" } },
    orderBy: { fetchedAt: "desc" },
  })

  // Um snapshot por conta: o mais recente. `orderBy` desc + primeiro visto.
  const latest = new Map<string, (typeof snapshots)[number]>()
  for (const snapshot of snapshots) {
    if (!latest.has(snapshot.externalId)) latest.set(snapshot.externalId, snapshot)
  }

  let updated = 0
  let skipped = 0

  for (const [externalId, snapshot] of latest) {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(snapshot.payloadJson) as Record<string, unknown>
    } catch {
      skipped += 1
      continue
    }

    const credit = extractCreditData(
      payload.creditData as Record<string, unknown> | null | undefined,
    )
    if (!credit) {
      skipped += 1
      continue
    }

    const providerUpdatedAt =
      typeof payload.updatedAt === "string" ? new Date(payload.updatedAt) : null

    console.log(
      `${payload.name ?? externalId}: limite=${credit.creditLimit} disponível=${credit.availableCreditLimit} (${providerUpdatedAt?.toISOString() ?? "sem data"})`,
    )

    if (dryRun) continue

    const record = await prisma.pluggyAccountRecord.updateMany({
      where: { externalId },
      data: {
        creditLimit: credit.creditLimit,
        availableCreditLimit: credit.availableCreditLimit,
        minimumPayment: credit.minimumPayment,
        creditLevel: credit.level,
        creditBrand: credit.brand,
        creditStatus: credit.status,
        isLimitFlexible: credit.isLimitFlexible,
        balanceCloseDate: credit.balanceCloseDate
          ? new Date(credit.balanceCloseDate)
          : null,
        balanceDueDate: credit.balanceDueDate
          ? new Date(credit.balanceDueDate)
          : null,
      },
    })
    if (record.count === 0) {
      skipped += 1
      continue
    }

    await prisma.domainAccount.updateMany({
      where: { sourceExternalId: externalId, sourceProvider: "PLUGGY" },
      data: {
        creditLimit: credit.creditLimit,
        availableCreditLimit: credit.availableCreditLimit,
        creditDataAt: providerUpdatedAt,
      },
    })
    updated += 1
  }

  console.log(
    `\n${dryRun ? "[dry-run] " : ""}contas com creditData: ${latest.size} · atualizadas: ${updated} · ignoradas: ${skipped}`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
