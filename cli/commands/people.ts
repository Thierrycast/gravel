import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const peopleCommand = new Command("people").description(
  "Pessoas, empréstimos e divisões de conta",
)

peopleCommand
  .command("list")
  .description("Lista pessoas cadastradas com valores a receber")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const [people, lends, shares] = await Promise.all([
      prisma.domainPerson.findMany({ orderBy: { name: "asc" } }),
      prisma.domainLend.findMany(),
      prisma.domainSplitShare.findMany(),
    ])

    log.heading("Pessoas")
    if (people.length === 0) {
      log.warn("Nenhuma pessoa cadastrada.")
      return
    }

    const table = new Table({
      head: ["Nome", "Telefone", "A receber", "Itens abertos"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    })
    for (const person of people) {
      const personLends = lends.filter((l) => l.personId === person.id && l.status === "PENDING")
      const personShares = shares.filter((s) => s.personId === person.id && s.status === "PENDING")
      const pending =
        personLends.reduce((sum, l) => sum + Number(l.amount), 0) +
        personShares.reduce((sum, s) => sum + Number(s.amount), 0)
      table.push([
        person.name,
        person.phone ?? "—",
        `R$ ${pending.toFixed(2)}`,
        String(personLends.length + personShares.length),
      ])
    }
    console.log(table.toString())
  })
