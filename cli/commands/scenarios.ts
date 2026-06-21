import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const scenariosCommand = new Command("scenarios").description(
  "Gerenciamento de cenários de simulação"
)

scenariosCommand
  .command("list")
  .description("Lista eventos e cenários simulados")
  .action(async () => {
    const { getDomainScenarios } = await import("../../lib/domain/queries.js")
    const data = await getDomainScenarios()

    log.heading("Cenários de Planejamento")
    const table = new Table({
      head: ["ID", "Título", "Valor", "Data", "Recorrente", "Frequência"],
      colWidths: [12, 34, 16, 14, 12, 12],
      style: { head: [], border: [] },
    })

    for (const sc of data.results) {
      const amt = Number(sc.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const valFmt = Number(sc.amount) < 0 ? chalk.red(amt) : chalk.green(amt)
      table.push([
        sc.id.slice(0, 8),
        sc.title,
        valFmt,
        sc.date instanceof Date ? sc.date.toISOString().slice(0, 10) : String(sc.date).slice(0, 10),
        sc.isRecurring ? chalk.green("sim") : chalk.dim("não"),
        sc.frequency || "ONCE",
      ])
    }
    console.log(table.toString())
  })

scenariosCommand
  .command("create")
  .description("Cria um cenário de planejamento futuro")
  .requiredOption("-t, --title <title>", "Título do cenário")
  .requiredOption("-a, --amount <val>", "Valor (negativo para despesas, positivo para receitas)")
  .requiredOption("-d, --date <date>", "Data de referência YYYY-MM-DD")
  .option("-r, --recurring", "Se é um evento recorrente")
  .option("-f, --frequency <freq>", "Frequência (ONCE|MONTHLY|YEARLY)", "ONCE")
  .option("-c, --category <id>", "ID da categoria associada")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const sc = await prisma.domainScenarioEvent.create({
      data: {
        title: options.title,
        amount: new Prisma.Decimal(Number(options.amount)),
        date: new Date(options.date),
        isRecurring: !!options.recurring,
        frequency: options.frequency.toUpperCase() as "ONCE" | "MONTHLY" | "YEARLY",
        categoryId: options.category || null,
      }
    })
    log.success(`Cenário "${sc.title}" criado com sucesso! ID: ${sc.id}`)
  })

scenariosCommand
  .command("delete <id>")
  .description("Exclui um cenário de planejamento")
  .action(async (id) => {
    const { prisma } = await import("../../lib/prisma.js")
    await prisma.domainScenarioEvent.delete({ where: { id } })
    log.success(`Cenário ${id} excluído com sucesso!`)
  })
