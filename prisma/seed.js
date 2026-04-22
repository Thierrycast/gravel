/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, Prisma } = require("@prisma/client")

const prisma = new PrismaClient()

const MANUAL = "MANUAL"

async function upsertCategory(slug, data) {
  return prisma.domainCategory.upsert({
    where: { slug },
    update: data,
    create: { slug, ...data },
  })
}

async function upsertAccount(externalId, data) {
  return prisma.domainAccount.upsert({
    where: {
      sourceProvider_sourceExternalId: {
        sourceProvider: MANUAL,
        sourceExternalId: externalId,
      },
    },
    update: data,
    create: {
      sourceProvider: MANUAL,
      sourceExternalId: externalId,
      ...data,
    },
  })
}

async function upsertTransaction(externalId, data) {
  return prisma.domainTransaction.upsert({
    where: {
      sourceProvider_sourceExternalId: {
        sourceProvider: MANUAL,
        sourceExternalId: externalId,
      },
    },
    update: data,
    create: {
      sourceProvider: MANUAL,
      sourceExternalId: externalId,
      ...data,
    },
  })
}

async function main() {
  const income = await upsertCategory("seed-salary", {
    name: "Salario",
    kind: "INCOME",
    color: "#22c55e",
  })
  const freelance = await upsertCategory("seed-freelance", {
    name: "Freelance",
    kind: "INCOME",
    color: "#10b981",
  })
  const housing = await upsertCategory("seed-housing", {
    name: "Moradia",
    kind: "EXPENSE",
    color: "#f97316",
  })
  const food = await upsertCategory("seed-food", {
    name: "Alimentacao",
    kind: "EXPENSE",
    color: "#eab308",
  })
  const transport = await upsertCategory("seed-transport", {
    name: "Transporte",
    kind: "EXPENSE",
    color: "#3b82f6",
  })

  const bank = await upsertAccount("seed-bank", {
    name: "Banco Principal",
    kind: "BANK",
    currencyCode: "BRL",
    balance: new Prisma.Decimal(8450.32),
  })

  const cash = await upsertAccount("seed-cash", {
    name: "Carteira",
    kind: "CASH",
    currencyCode: "BRL",
    balance: new Prisma.Decimal(320.5),
  })

  await upsertAccount("seed-card", {
    name: "Cartao Nubank",
    kind: "CARD",
    currencyCode: "BRL",
    balance: new Prisma.Decimal(-1240.78),
  })

  await upsertAccount("seed-invest", {
    name: "Investimentos",
    kind: "INVESTMENT",
    currencyCode: "BRL",
    balance: new Prisma.Decimal(23500.0),
  })

  const transactions = [
    {
      externalId: "seed-tx-1",
      direction: "INFLOW",
      amount: new Prisma.Decimal(9200.0),
      description: "Salario mensal",
      occurredAt: new Date("2026-03-01T09:00:00.000Z"),
      domainAccountId: bank.id,
      domainCategoryId: income.id,
    },
    {
      externalId: "seed-tx-2",
      direction: "INFLOW",
      amount: new Prisma.Decimal(1800.0),
      description: "Projeto landing page",
      occurredAt: new Date("2026-03-03T14:00:00.000Z"),
      domainAccountId: bank.id,
      domainCategoryId: freelance.id,
    },
    {
      externalId: "seed-tx-3",
      direction: "OUTFLOW",
      amount: new Prisma.Decimal(-2200.0),
      description: "Aluguel",
      occurredAt: new Date("2026-03-05T11:00:00.000Z"),
      domainAccountId: bank.id,
      domainCategoryId: housing.id,
    },
    {
      externalId: "seed-tx-4",
      direction: "OUTFLOW",
      amount: new Prisma.Decimal(-420.0),
      description: "Supermercado",
      occurredAt: new Date("2026-03-06T18:30:00.000Z"),
      domainAccountId: bank.id,
      domainCategoryId: food.id,
    },
    {
      externalId: "seed-tx-5",
      direction: "OUTFLOW",
      amount: new Prisma.Decimal(-180.0),
      description: "Combustivel",
      occurredAt: new Date("2026-03-07T19:15:00.000Z"),
      domainAccountId: cash.id,
      domainCategoryId: transport.id,
    },
  ]

  for (const { externalId, ...data } of transactions) {
    await upsertTransaction(externalId, {
      ...data,
      currencyCode: "BRL",
    })
  }

  await prisma.portfolioSnapshot.createMany({
    data: [
      {
        date: new Date("2026-02-01T00:00:00.000Z"),
        netWorth: new Prisma.Decimal(29850.0),
      },
      {
        date: new Date("2026-03-01T00:00:00.000Z"),
        netWorth: new Prisma.Decimal(32900.0),
      },
    ],
  })

  await prisma.balanceProjection.createMany({
    data: [
      {
        date: new Date("2026-04-01T00:00:00.000Z"),
        projectedBalance: new Prisma.Decimal(9700.0),
      },
      {
        date: new Date("2026-05-01T00:00:00.000Z"),
        projectedBalance: new Prisma.Decimal(11200.0),
      },
    ],
  })

  console.log("Seed concluido")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
