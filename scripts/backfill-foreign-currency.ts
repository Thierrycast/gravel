/**
 * Backfill: corrige transações em moeda estrangeira que foram ingeridas com o
 * `amount` na moeda original (ex.: USD) em vez do valor realmente cobrado na
 * conta (`amountInAccountCurrency`, ex.: BRL).
 *
 * Lê os PluggyPayloadSnapshot (fonte bruta), encontra transações com
 * `amountInAccountCurrency` e atualiza PluggyTransactionRecord e
 * DomainTransaction preservando o sinal aplicado pelo projetor.
 *
 * Uso: pnpm tsx --env-file=.env scripts/backfill-foreign-currency.ts [--dry-run]
 */
import { Prisma, PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const dryRun = process.argv.includes("--dry-run")

async function main() {
  const snapshots = await prisma.pluggyPayloadSnapshot.findMany({
    where: {
      resourceType: "transaction",
      payloadJson: { contains: "amountInAccountCurrency" },
    },
  })

  let fixed = 0
  for (const snapshot of snapshots) {
    let payload: {
      id?: string
      amount?: number
      amountInAccountCurrency?: number | null
      currencyCode?: string | null
      accountId?: string | null
    }
    try {
      payload = JSON.parse(snapshot.payloadJson)
    } catch {
      continue
    }
    const converted = payload.amountInAccountCurrency
    if (typeof converted !== "number" || !Number.isFinite(converted)) continue
    if (!payload.id) continue

    const account = payload.accountId
      ? await prisma.pluggyAccountRecord.findUnique({
          where: { externalId: payload.accountId },
          select: { currencyCode: true },
        })
      : null
    const accountCurrency = account?.currencyCode ?? "BRL"

    const record = await prisma.pluggyTransactionRecord.findUnique({
      where: { externalId: payload.id },
    })
    if (!record) continue

    const alreadyConverted =
      record.amount !== null &&
      Math.abs(Math.abs(Number(record.amount)) - Math.abs(converted)) < 0.005
    if (alreadyConverted && record.currencyCode === accountCurrency) continue

    console.log(
      `${payload.id}: ${record.description ?? "?"} — ${record.currencyCode} ${record.amount} -> ${accountCurrency} ${converted}`,
    )

    if (!dryRun) {
      await prisma.pluggyTransactionRecord.update({
        where: { externalId: payload.id },
        data: {
          amount: new Prisma.Decimal(converted),
          currencyCode: accountCurrency,
        },
      })

      const domainTx = await prisma.domainTransaction.findFirst({
        where: { sourceExternalId: payload.id, sourceProvider: "PLUGGY" },
      })
      if (domainTx) {
        const sign = Number(domainTx.amount) < 0 ? -1 : 1
        await prisma.domainTransaction.update({
          where: { id: domainTx.id },
          data: {
            amount: new Prisma.Decimal(sign * Math.abs(converted)),
            currencyCode: accountCurrency,
          },
        })
      }
    }
    fixed += 1
  }

  console.log(`${dryRun ? "[dry-run] " : ""}${fixed} transação(ões) corrigida(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
