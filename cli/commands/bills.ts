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
  .command("statements")
  .description("Faturas por ciclo (motor de billing): atual, próximas, passadas, total em aberto")
  .option("-a, --account <id>", "ID de um cartão específico")
  .action(async (options) => {
    const { getCardStatements } = await import("../../lib/domain/billing.js")
    const cards = await getCardStatements(
      options.account ? { accountId: options.account } : {},
    )
    log.heading("Faturas por cartão")
    if (cards.length === 0) {
      log.warn("Nenhum cartão encontrado.")
      return
    }
    for (const card of cards) {
      const header = card.configured
        ? `${card.accountName} · fecha dia ${card.closingDay} · vence dia ${card.dueDay ?? "—"}`
        : `${card.accountName} · ciclo não configurado`
      log.info(chalk.bold(header))
      if (card.configured) {
        const cur = card.current
        console.log(
          `  Fatura atual:   ${cur ? `R$ ${cur.amount.toFixed(2)} (${cur.status}) vence ${cur.dueDate.slice(0, 10)}` : "—"}`,
        )
        console.log(`  Próximas:       ${card.upcoming.filter((s) => s.amount > 0).length} · total em aberto R$ ${card.totalOpen.toFixed(2)}`)
        const overdue = card.past.filter((s) => s.status === "OVERDUE")
        if (overdue.length > 0) {
          console.log(chalk.red(`  Vencidas:       ${overdue.length} (R$ ${overdue.reduce((s, b) => s + b.amount, 0).toFixed(2)})`))
        }
      }
      console.log("")
    }
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
