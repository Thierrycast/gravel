import { Command } from "commander"
import Table from "cli-table3"
import type { Prisma as PrismaTypes } from "@prisma/client"
import { log } from "../core/logger.js"

export const accountsCommand = new Command("accounts").description(
  "Gerenciamento de contas"
)

accountsCommand
  .command("list")
  .description("Lista contas e seus saldos")
  .action(async () => {
    const { getDomainAccounts } = await import("../../lib/domain/queries.js")
    const data = await getDomainAccounts(new URLSearchParams({ pageSize: "100" }))

    log.heading(`Contas (${data.total} encontradas)`)
    const table = new Table({
      head: ["ID", "Nome", "Apelido", "Tipo", "Saldo", "Provedor"],
      colWidths: [12, 24, 18, 14, 16, 12],
      style: { head: [], border: [] },
    })

    for (const acc of data.results) {
      const bal = acc.balance ? Number(acc.balance).toLocaleString("pt-BR", { style: "currency", currency: acc.currencyCode }) : "N/A"
      table.push([
        acc.id.slice(0, 8),
        acc.name,
        acc.nickname || "",
        acc.kind,
        bal,
        acc.sourceProvider,
      ])
    }
    console.log(table.toString())
  })

accountsCommand
  .command("update <id>")
  .description("Atualiza campos de uma conta manual")
  .option("--name <name>", "Novo nome da conta")
  .option("--nickname <nick>", "Novo apelido")
  .option("--balance <val>", "Novo saldo (apenas para contas manuais)")
  .action(async (id, options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")
    const { normalizeText } = await import("../../lib/domain/utils.js")

    const existing = await prisma.domainAccount.findUnique({ where: { id } })
    if (!existing) throw new Error("Conta não encontrada")

    const data: PrismaTypes.DomainAccountUpdateInput = {}
    if (options.name) {
      data.name = options.name
      data.normalizedName = normalizeText(options.name)
    }
    if (options.nickname) data.nickname = options.nickname
    if (options.balance !== undefined) {
      if (existing.sourceProvider !== "MANUAL") {
        throw new Error("Apenas o saldo de contas manuais pode ser editado")
      }
      data.balance = new Prisma.Decimal(Number(options.balance))
    }

    await prisma.domainAccount.update({
      where: { id },
      data,
    })
    log.success(`Conta ${id} atualizada com sucesso!`)
  })
