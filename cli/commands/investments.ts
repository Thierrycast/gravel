import { Command } from "commander"
import Table from "cli-table3"
import { log } from "../core/logger.js"

export const investmentsCommand = new Command("investments").description(
  "Gerenciamento de investimentos"
)

investmentsCommand
  .command("list")
  .description("Lista investimentos de renda fixa e variável")
  .action(async () => {
    const { getDomainInvestments } = await import("../../lib/domain/queries.js")
    const data = await getDomainInvestments(new URLSearchParams({ pageSize: "100" }))

    log.heading(`Investimentos (${data.total} encontrados)`)
    
    if (data.results.length === 0) {
      log.success("Nenhum investimento encontrado.")
      return
    }

    const table = new Table({
      head: ["ID", "Nome", "Tipo", "Saldo", "Provedor"],
      colWidths: [12, 28, 16, 16, 14],
      style: { head: [], border: [] },
    })

    for (const inv of data.results) {
      const bal = inv.balance ? Number(inv.balance).toLocaleString("pt-BR", { style: "currency", currency: inv.currencyCode || "BRL" }) : "N/A"
      table.push([
        inv.id.slice(0, 8),
        inv.name,
        inv.type || "N/A",
        bal,
        inv.sourceProvider,
      ])
    }
    console.log(table.toString())
  })
