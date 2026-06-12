import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"

import { log } from "../core/logger.js"

function statusColor(status: string) {
  if (status === "resolved") return chalk.green(status)
  if (status === "ignored") return chalk.dim(status)
  return chalk.yellow(status)
}

export const reviewCommand = new Command("review").description(
  "Rotinas operacionais: inbox financeira e fechamento do mes"
)

reviewCommand
  .command("inbox")
  .description("Lista pendencias acionaveis da Inbox Financeira")
  .option("--all", "Inclui resolvidas e ignoradas")
  .action(async (options) => {
    const { getInboxPayload } = await import("@/lib/domain/review")
    const payload = await getInboxPayload()
    const rows = options.all
      ? payload.results
      : payload.results.filter((item) => item.status === "open")

    log.heading("Inbox Financeira")
    log.info(
      `${payload.summary.open} abertas, ${payload.summary.resolved} resolvidas, ${payload.summary.ignored} ignoradas`
    )

    if (rows.length === 0) {
      log.success("Nenhuma pendencia neste filtro")
      return
    }

    const table = new Table({
      head: ["Severidade", "Status", "Origem", "Titulo", "Impacto"],
      colWidths: [12, 12, 18, 42, 44],
      wordWrap: true,
      style: { head: [], border: [] },
    })

    for (const item of rows) {
      table.push([
        item.severity,
        statusColor(item.status),
        item.origin,
        item.title,
        item.impact,
      ])
    }

    console.log(table.toString())
  })

reviewCommand
  .command("resolve <id>")
  .description("Marca um item da inbox como resolvido")
  .action(async (id: string) => {
    const { setInboxItemStatus } = await import("@/lib/domain/review")
    await setInboxItemStatus(id, "resolved")
    log.success(`Item resolvido: ${id}`)
  })

reviewCommand
  .command("ignore <id>")
  .description("Marca um item da inbox como ignorado")
  .action(async (id: string) => {
    const { setInboxItemStatus } = await import("@/lib/domain/review")
    await setInboxItemStatus(id, "ignored")
    log.success(`Item ignorado: ${id}`)
  })

reviewCommand
  .command("monthly-close")
  .description("Mostra o checklist de fechamento do mes")
  .option("-m, --month <yyyy-mm>", "Mes de referencia")
  .action(async (options) => {
    const { currentMonthKey, getMonthlyClosePayload } = await import("@/lib/domain/review")
    const month = options.month ?? currentMonthKey()
    const payload = await getMonthlyClosePayload(month)

    log.heading(`Fechamento do mes: ${month}`)
    log.info(
      `${payload.summary.completedSteps}/${payload.summary.totalSteps} etapas concluidas; resultado ${Number(payload.summary.net).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
    )

    const table = new Table({
      head: ["Status", "Etapa", "Pendencias", "Impacto"],
      colWidths: [10, 34, 12, 54],
      wordWrap: true,
      style: { head: [], border: [] },
    })

    for (const step of payload.results) {
      table.push([
        step.completed ? chalk.green("ok") : chalk.yellow("aberta"),
        step.title,
        String(step.pending),
        step.impact,
      ])
    }

    console.log(table.toString())
  })
