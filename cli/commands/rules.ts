import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const rulesCommand = new Command("rules").description(
  "Gerenciamento de regras de categorização automática"
)

rulesCommand
  .command("list")
  .description("Lista regras de automação")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const [rules, categories] = await Promise.all([
      prisma.categoryRule.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      }),
      prisma.domainCategory.findMany({
        select: { id: true, name: true },
      }),
    ])

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

    log.heading("Regras de Categorização Automática")
    const table = new Table({
      head: ["ID", "Prioridade", "Campo", "Match", "Valor", "Categoria", "Status"],
      colWidths: [12, 12, 12, 10, 24, 22, 10],
      style: { head: [], border: [] },
    })

    for (const r of rules) {
      table.push([
        r.id.slice(0, 8),
        String(r.priority),
        r.matchField,
        r.matchType,
        r.matchValue,
        (r.domainCategoryId ? categoryMap.get(r.domainCategoryId) : null) || r.domainCategoryId || "",
        r.active ? chalk.green("ativa") : chalk.dim("inativa"),
      ])
    }
    console.log(table.toString())
  })

rulesCommand
  .command("create")
  .description("Cria uma regra de automação")
  .requiredOption("-t, --type <type>", "Tipo de correspondência (EXACT|CONTAINS|PREFIX|REGEX)")
  .requiredOption("-f, --field <field>", "Campo da transação (ex: description)")
  .requiredOption("-v, --value <value>", "Valor esperado no match")
  .requiredOption("-c, --category <id>", "ID da categoria a atribuir")
  .option("-p, --priority <n>", "Prioridade da regra", "100")
  .option("--inactive", "Desativar regra na criação")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")

    const rule = await prisma.categoryRule.create({
      data: {
        matchType: options.type.toUpperCase() as "EXACT" | "CONTAINS" | "PREFIX" | "REGEX",
        matchField: options.field,
        matchValue: options.value,
        domainCategoryId: options.category,
        priority: Number(options.priority),
        active: !options.inactive,
      }
    })
    log.success(`Regra de automação criada! ID: ${rule.id}`)
  })

rulesCommand
  .command("delete <id>")
  .description("Exclui uma regra de automação")
  .action(async (id) => {
    const { prisma } = await import("../../lib/prisma.js")
    await prisma.categoryRule.delete({ where: { id } })
    log.success(`Regra ${id} excluída com sucesso!`)
  })
