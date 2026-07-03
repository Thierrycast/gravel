import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const recurringCommand = new Command("recurring").description(
  "Recorrências (detectadas pela Pluggy e manuais)",
)

recurringCommand
  .command("detected")
  .description("Recorrências detectadas pela Pluggy (receitas e despesas)")
  .option("--hidden", "Incluir as ocultadas pelo usuário")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const rows = await prisma.pluggyRecurringPayment.findMany({
      where: options.hidden ? {} : { userStatus: { not: "HIDDEN" } },
      orderBy: [{ regularityScore: "desc" }, { occurrences: "desc" }],
    })

    log.heading("Recorrências detectadas pela Pluggy")
    if (rows.length === 0) {
      log.warn("Nenhuma recorrência detectada. Rode um sync com refresh primeiro.")
      return
    }

    const table = new Table({
      head: ["Descrição", "Direção", "Média", "Ocorr.", "Confiança", "Status"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    })
    for (const row of rows) {
      const amount = Number(row.averageAmount.toString())
      const score = row.regularityScore ? Number(row.regularityScore.toString()) : null
      const confidence =
        score === null ? "—" : score >= 0.9 ? chalk.green("Alta") : score >= 0.7 ? chalk.yellow("Média") : chalk.red("Baixa")
      const dirColor = row.direction === "INCOME" ? chalk.green : chalk.red
      table.push([
        row.description.slice(0, 32),
        dirColor(row.direction === "INCOME" ? "Receita" : "Despesa"),
        `R$ ${Math.abs(amount).toFixed(2)}`,
        String(row.occurrences),
        confidence,
        row.userStatus,
      ])
    }
    console.log(table.toString())
  })

recurringCommand
  .command("set-status <id> <status>")
  .description("Confirma, oculta ou reabre uma recorrência (CONFIRMED|HIDDEN|SUGGESTED)")
  .action(async (id: string, status: string) => {
    const userStatus = status.toUpperCase()
    if (!["SUGGESTED", "CONFIRMED", "HIDDEN"].includes(userStatus)) {
      throw new Error("Status inválido. Use CONFIRMED, HIDDEN ou SUGGESTED.")
    }
    const { prisma } = await import("../../lib/prisma.js")
    await prisma.pluggyRecurringPayment.update({ where: { id }, data: { userStatus } })
    log.success(`Recorrência ${id} marcada como ${userStatus}.`)
  })
