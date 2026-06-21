import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const billsCommand = new Command("bills").description(
  "Gerenciamento de faturas de cartão"
)

billsCommand
  .command("list")
  .description("Lista faturas de cartão de crédito")
  .option("-m, --month <yyyy-mm>", "Mês de referência (default mês atual)")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const month = options.month ?? new Date().toISOString().slice(0, 7)
    
    // Calculate date ranges for the month YYYY-MM
    const from = new Date(`${month}-01T00:00:00.000Z`)
    const to = new Date(from)
    to.setUTCMonth(to.getUTCMonth() + 1)

    const bills = await prisma.domainBill.findMany({
      where: {
        dueDate: {
          gte: from,
          lt: to,
        }
      },
      include: {
        domainAccount: true
      },
      orderBy: { dueDate: "asc" }
    })

    log.heading(`Faturas de Cartão - Mês: ${month}`)
    const table = new Table({
      head: ["ID", "Conta/Cartão", "Vencimento", "Valor", "Status"],
      colWidths: [12, 32, 16, 16, 12],
      style: { head: [], border: [] },
    })

    for (const bill of bills) {
      const amt = bill.totalAmount ? Number(bill.totalAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00"
      const statusFmt = bill.status === "PAID" ? chalk.green("PAID") : bill.status === "OVERDUE" ? chalk.red("OVERDUE") : chalk.yellow("OPEN")
      table.push([
        bill.id.slice(0, 8),
        bill.domainAccount?.name || bill.domainAccountId || "",
        bill.dueDate instanceof Date ? bill.dueDate.toISOString().slice(0, 10) : String(bill.dueDate).slice(0, 10),
        amt,
        statusFmt,
      ])
    }
    console.log(table.toString())
  })

billsCommand
  .command("pay <id>")
  .description("Marca uma fatura como paga")
  .option("--status <status>", "Novo status (paid|open|overdue)", "paid")
  .action(async (id, options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const status = options.status.toUpperCase()

    if (status !== "PAID" && status !== "OPEN" && status !== "OVERDUE") {
      throw new Error("Status inválido")
    }

    await prisma.domainBill.update({
      where: { id },
      data: { status }
    })
    log.success(`Fatura ${id} atualizada para ${status}!`)
  })
