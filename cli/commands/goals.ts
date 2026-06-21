import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import type { Prisma as PrismaTypes } from "@prisma/client"
import { log } from "../core/logger.js"

export const goalsCommand = new Command("goals").description(
  "Gerenciamento de metas financeiras"
)

goalsCommand
  .command("list")
  .description("Lista metas financeiras")
  .option("--all", "Exibir metas inativas também")
  .action(async (options) => {
    const { getDomainGoals } = await import("../../lib/domain/queries.js")
    const data = await getDomainGoals(!options.all)

    log.heading(`Metas Financeiras`)
    const table = new Table({
      head: ["ID", "Meta", "Valor Alvo", "Economizado", "Progresso", "Vencimento", "Status"],
      colWidths: [12, 28, 16, 16, 12, 16, 10],
      style: { head: [], border: [] },
    })

    for (const goal of data.results) {
      const tgt = Number(goal.targetAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const saved = Number(goal.currentAmount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const prog = Number(goal.targetAmount) > 0 ? (Number(goal.currentAmount) / Number(goal.targetAmount) * 100).toFixed(1) + "%" : "0%"
      table.push([
        goal.id.slice(0, 8),
        `${goal.emoji || ""} ${goal.name}`,
        tgt,
        saved,
        prog,
        goal.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : "N/A",
        goal.active ? chalk.green("Ativa") : chalk.dim("Inativa"),
      ])
    }
    console.log(table.toString())
  })

goalsCommand
  .command("create")
  .description("Cria uma nova meta")
  .requiredOption("-n, --name <name>", "Nome da meta")
  .requiredOption("-t, --target-amount <n>", "Valor alvo")
  .option("-e, --emoji <emoji>", "Emoji da meta")
  .option("--current-amount <n>", "Valor já economizado", "0")
  .option("--monthly-contribution <n>", "Aporte mensal pretendido", "0")
  .option("--target-date <date>", "Data alvo YYYY-MM-DD")
  .option("--match-category <slug>", "Auto-matching: Slug da categoria")
  .option("--match-keyword <word>", "Auto-matching: Palavra-chave na descrição")
  .option("--match-date-start <date>", "Auto-matching: Data inicial YYYY-MM-DD")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const goal = await prisma.goal.create({
      data: {
        name: options.name,
        targetAmount: new Prisma.Decimal(Number(options.targetAmount)),
        emoji: options.emoji || undefined,
        currentAmount: new Prisma.Decimal(Number(options.currentAmount)),
        monthlyContribution: new Prisma.Decimal(Number(options.monthlyContribution)),
        targetDate: options.targetDate ? new Date(options.targetDate) : null,
        matchCategorySlug: options.matchCategory || null,
        matchKeyword: options.matchKeyword || null,
        matchDateStart: options.matchDateStart ? new Date(options.matchDateStart) : null,
      }
    })
    log.success(`Meta "${goal.name}" criada com sucesso! ID: ${goal.id}`)
  })

goalsCommand
  .command("update <id>")
  .description("Atualiza campos de uma meta")
  .option("--name <name>", "Novo nome")
  .option("--emoji <emoji>", "Novo emoji")
  .option("--target-amount <n>", "Novo valor alvo")
  .option("--current-amount <n>", "Novo valor economizado")
  .option("--monthly-contribution <n>", "Novo aporte mensal")
  .option("--target-date <date>", "Nova data limite YYYY-MM-DD")
  .option("--active <bool>", "Marcar ativa/inativa (true|false)")
  .option("--match-category <slug>", "Auto-matching: Slug da categoria")
  .option("--match-keyword <word>", "Auto-matching: Palavra-chave")
  .option("--match-date-start <date>", "Auto-matching: Data inicial YYYY-MM-DD")
  .action(async (id, options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const data: PrismaTypes.GoalUpdateInput = {}
    if (options.name) data.name = options.name
    if (options.emoji) data.emoji = options.emoji
    if (options.targetAmount) data.targetAmount = new Prisma.Decimal(Number(options.targetAmount))
    if (options.currentAmount) data.currentAmount = new Prisma.Decimal(Number(options.currentAmount))
    if (options.monthlyContribution) data.monthlyContribution = new Prisma.Decimal(Number(options.monthlyContribution))
    if (options.targetDate !== undefined) data.targetDate = options.targetDate ? new Date(options.targetDate) : null
    if (options.active !== undefined) data.active = options.active === "true"
    if (options.matchCategory !== undefined) data.matchCategorySlug = options.matchCategory || null
    if (options.matchKeyword !== undefined) data.matchKeyword = options.matchKeyword || null
    if (options.matchDateStart !== undefined) data.matchDateStart = options.matchDateStart ? new Date(options.matchDateStart) : null

    await prisma.goal.update({
      where: { id },
      data,
    })
    log.success(`Meta ${id} atualizada com sucesso!`)
  })

goalsCommand
  .command("delete <id>")
  .description("Exclui (desativa) uma meta")
  .action(async (id) => {
    const { prisma } = await import("../../lib/prisma.js")
    await prisma.goal.update({
      where: { id },
      data: { active: false }
    })
    log.success(`Meta ${id} desativada com sucesso!`)
  })
