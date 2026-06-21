import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const cryptoCommand = new Command("crypto").description(
  "Gerenciamento do portfólio cripto"
)

cryptoCommand
  .command("list")
  .description("Lista ativos e posições de criptomoedas")
  .action(async () => {
    const { getDomainCryptoAssets } = await import("../../lib/domain/queries.js")
    const data = await getDomainCryptoAssets(new URLSearchParams({ pageSize: "100" }))

    log.heading(`Portfólio Cripto (${data.total} ativos)`)
    
    if (data.results.length === 0) {
      log.success("Nenhum ativo cripto encontrado.")
      return
    }

    const table = new Table({
      head: ["Ativo", "Quantidade", "Preço", "Valor (BRL)", "Custo Médio", "P&L Não Realizado"],
      colWidths: [10, 16, 16, 16, 14, 18],
      style: { head: [], border: [] },
    })

    for (const cry of data.results) {
      const pnlVal = Number(cry.pnlUnrealized || 0)
      const pnlFmt = pnlVal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const pnlColor = pnlVal < 0 ? chalk.red : pnlVal > 0 ? chalk.green : chalk.dim
      
      const valFmt = cry.value ? Number(cry.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "N/A"
      const priceFmt = cry.price ? Number(cry.price).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "N/A"
      const costFmt = cry.costBasis ? Number(cry.costBasis).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "N/A"

      table.push([
        cry.asset,
        Number(cry.quantity).toString(),
        priceFmt,
        valFmt,
        costFmt,
        pnlColor(pnlFmt),
      ])
    }
    console.log(table.toString())
  })
