const { PrismaClient, Prisma } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  const bank = await prisma.account.create({
    data: {
      name: "Banco Principal",
      type: "BANK",
      currency: "BRL",
      balance: new Prisma.Decimal(8450.32),
    },
  })

  const cash = await prisma.account.create({
    data: {
      name: "Carteira",
      type: "CASH",
      currency: "BRL",
      balance: new Prisma.Decimal(320.5),
    },
  })

  const card = await prisma.account.create({
    data: {
      name: "Cartao Nubank",
      type: "CARD",
      currency: "BRL",
      balance: new Prisma.Decimal(-1240.78),
    },
  })

  const invest = await prisma.account.create({
    data: {
      name: "Investimentos",
      type: "INVESTMENT",
      currency: "BRL",
      balance: new Prisma.Decimal(23500.0),
    },
  })

  const income = await prisma.category.create({
    data: { name: "Salario", type: "INCOME", color: "#22c55e" },
  })

  const freelance = await prisma.category.create({
    data: { name: "Freelance", type: "INCOME", color: "#10b981" },
  })

  const housing = await prisma.category.create({
    data: { name: "Moradia", type: "EXPENSE", color: "#f97316" },
  })

  const food = await prisma.category.create({
    data: { name: "Alimentacao", type: "EXPENSE", color: "#eab308" },
  })

  const transport = await prisma.category.create({
    data: { name: "Transporte", type: "EXPENSE", color: "#3b82f6" },
  })

  await prisma.transaction.createMany({
    data: [
      {
        type: "INCOME",
        amount: new Prisma.Decimal(9200.0),
        description: "Salario mensal",
        date: new Date("2026-03-01T09:00:00.000Z"),
        accountId: bank.id,
        categoryId: income.id,
      },
      {
        type: "INCOME",
        amount: new Prisma.Decimal(1800.0),
        description: "Projeto landing page",
        date: new Date("2026-03-03T14:00:00.000Z"),
        accountId: bank.id,
        categoryId: freelance.id,
      },
      {
        type: "EXPENSE",
        amount: new Prisma.Decimal(2200.0),
        description: "Aluguel",
        date: new Date("2026-03-05T11:00:00.000Z"),
        accountId: bank.id,
        categoryId: housing.id,
      },
      {
        type: "EXPENSE",
        amount: new Prisma.Decimal(420.0),
        description: "Supermercado",
        date: new Date("2026-03-06T18:30:00.000Z"),
        accountId: bank.id,
        categoryId: food.id,
      },
      {
        type: "EXPENSE",
        amount: new Prisma.Decimal(180.0),
        description: "Combustivel",
        date: new Date("2026-03-07T19:15:00.000Z"),
        accountId: cash.id,
        categoryId: transport.id,
      },
    ],
  })

  await prisma.recurringItem.createMany({
    data: [
      {
        title: "Assinatura streaming",
        type: "EXPENSE",
        amount: new Prisma.Decimal(59.9),
        interval: "MONTHLY",
        nextDate: new Date("2026-03-15T00:00:00.000Z"),
        accountId: card.id,
      },
      {
        title: "Internet residencial",
        type: "EXPENSE",
        amount: new Prisma.Decimal(129.9),
        interval: "MONTHLY",
        nextDate: new Date("2026-03-10T00:00:00.000Z"),
        accountId: bank.id,
      },
      {
        title: "Renda aluguel",
        type: "INCOME",
        amount: new Prisma.Decimal(1500.0),
        interval: "MONTHLY",
        nextDate: new Date("2026-03-12T00:00:00.000Z"),
        accountId: bank.id,
      },
    ],
  })

  await prisma.bill.create({
    data: {
      periodStart: new Date("2026-02-10T00:00:00.000Z"),
      periodEnd: new Date("2026-03-09T00:00:00.000Z"),
      dueDate: new Date("2026-03-15T00:00:00.000Z"),
      total: new Prisma.Decimal(1240.78),
      status: "OPEN",
      accountId: card.id,
    },
  })

  await prisma.cryptoAsset.createMany({
    data: [
      {
        symbol: "BTC",
        name: "Bitcoin",
        amount: new Prisma.Decimal(0.42),
        avgPrice: new Prisma.Decimal(205000.0),
        lastPrice: new Prisma.Decimal(218500.0),
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        amount: new Prisma.Decimal(3.5),
        avgPrice: new Prisma.Decimal(11200.0),
        lastPrice: new Prisma.Decimal(11850.0),
      },
    ],
  })

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
