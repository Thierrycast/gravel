import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import type { Prisma as PrismaTypes } from "@prisma/client"
import { log } from "../core/logger.js"

export const lendsCommand = new Command("lends").description(
  "Gerenciamento de empréstimos devidos/a receber"
)

lendsCommand
  .command("list")
  .description("Lista empréstimos pendentes e resolvidos")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const lends = await prisma.domainLend.findMany({ orderBy: { dueDate: "asc" } })

    log.heading("Empréstimos e Pendências")
    const table = new Table({
      head: ["ID", "Amigo", "Valor", "Vencimento", "Status", "Descrição"],
      colWidths: [12, 22, 16, 14, 12, 34],
      style: { head: [], border: [] },
      wordWrap: true,
    })

    for (const l of lends) {
      const amt = Number(l.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const statusFmt = l.status === "PENDING" ? chalk.yellow("PENDENTE") : chalk.green("QUITADO")
      table.push([
        l.id.slice(0, 8),
        l.friendName,
        amt,
        l.dueDate instanceof Date ? l.dueDate.toISOString().slice(0, 10) : String(l.dueDate).slice(0, 10),
        statusFmt,
        l.description || "",
      ])
    }
    console.log(table.toString())
  })

lendsCommand
  .command("create")
  .description("Cria um registro de empréstimo")
  .requiredOption("-f, --friend <name>", "Nome do amigo")
  .requiredOption("-a, --amount <val>", "Valor")
  .requiredOption("-d, --due-date <date>", "Data de vencimento YYYY-MM-DD")
  .option("-p, --phone <phone>", "Telefone do amigo")
  .option("--desc <desc>", "Descrição/Observação")
  .option("-c, --category <id>", "ID da categoria")
  .option("--bill <id>", "ID da fatura associada")
  .option("--transaction <id>", "ID da transação de origem (saída)")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const lend = await prisma.domainLend.create({
      data: {
        friendName: options.friend,
        friendPhone: options.phone || null,
        amount: new Prisma.Decimal(Number(options.amount)),
        dueDate: new Date(options.dueDate),
        description: options.desc || null,
        categoryId: options.category || null,
        domainBillId: options.bill || null,
        domainTransactionId: options.transaction || null,
        status: "PENDING",
      }
    })
    log.success(`Empréstimo para ${lend.friendName} registrado! ID: ${lend.id}`)
  })

lendsCommand
  .command("update <id>")
  .description("Atualiza campos de um empréstimo")
  .option("--friend <name>", "Novo nome do amigo")
  .option("--amount <val>", "Novo valor")
  .option("--due-date <date>", "Nova data de vencimento YYYY-MM-DD")
  .option("--status <status>", "Status (pending|paid)")
  .option("--phone <phone>", "Novo telefone")
  .option("--desc <desc>", "Nova descrição")
  .option("--inflow-transaction <id>", "ID da transação de quitação")
  .action(async (id, options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const data: PrismaTypes.DomainLendUpdateInput = {}
    if (options.friend) data.friendName = options.friend
    if (options.amount) data.amount = new Prisma.Decimal(Number(options.amount))
    if (options.dueDate) data.dueDate = new Date(options.dueDate)
    if (options.status) data.status = options.status.toUpperCase()
    if (options.phone !== undefined) data.friendPhone = options.phone || null
    if (options.desc !== undefined) data.description = options.desc || null
    if (options.inflowTransaction !== undefined) data.inflowTransactionId = options.inflowTransaction || null

    await prisma.domainLend.update({
      where: { id },
      data,
    })
    log.success(`Empréstimo ${id} atualizado com sucesso!`)
  })

lendsCommand
  .command("delete <id>")
  .description("Exclui um empréstimo")
  .action(async (id) => {
    const { prisma } = await import("../../lib/prisma.js")
    await prisma.domainLend.delete({ where: { id } })
    log.success(`Empréstimo ${id} excluído com sucesso!`)
  })
