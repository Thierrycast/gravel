import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { DomainTransactionDirection, type Prisma } from "@prisma/client"
import { log } from "../core/logger.js"

export const transactionsCommand = new Command("transactions").description(
  "Gerenciamento de transações"
)

transactionsCommand
  .command("list")
  .description("Lista transações com filtros e paginação")
  .option("-q, --query <q>", "Termo de busca")
  .option("-p, --period <period>", "Atalho de período (mtd|30d|90d|180d|12m|ytd|all)", "mtd")
  .option("--from <date>", "Data inicial YYYY-MM-DD")
  .option("--to <date>", "Data final YYYY-MM-DD")
  .option("-d, --direction <direction>", "Direção (inflow|outflow|transfer)")
  .option("--account <id>", "ID da conta")
  .option("--category <id>", "ID da categoria")
  .option("--merchant <id>", "ID do comerciante")
  .option("--min-amount <n>", "Valor mínimo")
  .option("--max-amount <n>", "Valor máximo")
  .option("--sort-by <field>", "Ordenar por campo", "occurredAt")
  .option("--sort-order <order>", "Ordem da ordenação (asc|desc)", "desc")
  .option("--page <n>", "Número da página", "1")
  .option("--page-size <n>", "Itens por página", "50")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")
    
    // Build filter criteria
    const where: Prisma.DomainTransactionWhereInput = {
      ignored: options.ignored === "true",
    }
    if (options.query) {
      where.OR = [
        { description: { contains: options.query } },
        { merchantName: { contains: options.query } },
      ]
    }
    if (options.direction) {
      const direction = options.direction.toUpperCase()
      if (
        direction === DomainTransactionDirection.INFLOW ||
        direction === DomainTransactionDirection.OUTFLOW ||
        direction === DomainTransactionDirection.TRANSFER
      ) {
        where.direction = direction
      }
    }
    if (options.account) {
      where.domainAccountId = options.account
    }
    if (options.category) {
      where.domainCategoryId = options.category
    }
    if (options.merchant) {
      where.domainMerchantId = options.merchant
    }
    if (options.minAmount || options.maxAmount) {
      where.amount = {
        gte: options.minAmount ? new Prisma.Decimal(Number(options.minAmount)) : undefined,
        lte: options.maxAmount ? new Prisma.Decimal(Number(options.maxAmount)) : undefined,
      }
    }

    let fromDate: Date | undefined
    let toDate: Date | undefined
    if (options.from) fromDate = new Date(options.from)
    if (options.to) toDate = new Date(options.to)
    
    if (fromDate || toDate) {
      where.occurredAt = {
        gte: fromDate,
        lte: toDate,
      }
    }

    const page = Number(options.page || 1)
    const pageSize = Number(options.pageSize || 50)
    const skip = (page - 1) * pageSize

    const [total, results] = await Promise.all([
      prisma.domainTransaction.count({ where }),
      prisma.domainTransaction.findMany({
        where,
        include: {
          domainAccount: true,
          domainCategory: true,
        },
        orderBy: [
          { [options.sortBy || "occurredAt"]: options.sortOrder || "desc" },
          { createdAt: "desc" }
        ],
        skip,
        take: pageSize,
      })
    ])

    log.heading(`Transações (${total} encontradas)`)
    
    if (results.length === 0) {
      log.success("Nenhuma transação encontrada.")
      return
    }

    const table = new Table({
      head: ["ID", "Data", "Descrição", "Valor", "Direção", "Conta", "Categoria"],
      colWidths: [12, 12, 28, 14, 10, 18, 18],
      wordWrap: true,
      style: { head: [], border: [] },
    })

    for (const tx of results) {
      const amt = Number(tx.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      const dirColor = tx.direction === "INFLOW" ? chalk.green : tx.direction === "OUTFLOW" ? chalk.red : chalk.yellow
      table.push([
        tx.id.slice(0, 8),
        tx.occurredAt instanceof Date ? tx.occurredAt.toISOString().slice(0, 10) : String(tx.occurredAt).slice(0, 10),
        tx.description || "",
        dirColor(amt),
        tx.direction,
        tx.domainAccount?.name || tx.domainAccountId || "",
        tx.domainCategory?.name || tx.domainCategoryId || "",
      ])
    }

    console.log(table.toString())
  })

transactionsCommand
  .command("create")
  .description("Cria uma transação manual")
  .requiredOption("-d, --description <desc>", "Descrição da transação")
  .requiredOption("-a, --amount <val>", "Valor positivo")
  .requiredOption("--direction <dir>", "Direção (inflow|outflow)")
  .option("--occurred-at <date>", "Data da transação YYYY-MM-DD")
  .option("--account <id>", "ID da conta associada")
  .option("--category <id>", "ID da categoria associada")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")
    const crypto = await import("node:crypto")
    
    const desc = options.description.trim()
    const amt = Number(options.amount)
    const dir = options.direction.toUpperCase()
    const occurredAt = options.occurredAt ? new Date(options.occurredAt) : new Date()

    if (!desc) throw new Error("Descrição é obrigatória")
    if (isNaN(amt) || amt <= 0) throw new Error("Valor inválido")
    if (dir !== "INFLOW" && dir !== "OUTFLOW") throw new Error("Direção inválida")
    if (isNaN(occurredAt.getTime())) throw new Error("Data inválida")

    const tx = await prisma.domainTransaction.create({
      data: {
        description: desc,
        amount: new Prisma.Decimal(amt),
        direction: dir,
        occurredAt,
        sourceProvider: "MANUAL",
        sourceExternalId: `manual-${crypto.randomUUID()}`,
        domainAccountId: options.account || null,
        domainCategoryId: options.category || null,
      }
    })
    log.success(`Transação criada com sucesso! ID: ${tx.id}`)
  })

transactionsCommand
  .command("update <id>")
  .description("Atualiza campos de uma transação")
  .option("--description <desc>", "Nova descrição")
  .option("--amount <val>", "Novo valor")
  .option("--direction <dir>", "Nova direção (inflow|outflow|transfer)")
  .option("--occurred-at <date>", "Nova data YYYY-MM-DD")
  .option("--category <id>", "Novo ID da categoria")
  .option("--merchant-name <name>", "Novo nome de comerciante")
  .option("--ignored <bool>", "Se deve ignorar (true|false)")
  .action(async (id, options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")
    const { normalizeText } = await import("../../lib/domain/utils.js")
    
    const existing = await prisma.domainTransaction.findUnique({ where: { id } })
    if (!existing) throw new Error("Transação não encontrada")

    const updateData: Prisma.DomainTransactionUncheckedUpdateInput = {}
    if (options.description) {
      updateData.description = options.description
      updateData.normalizedDescription = normalizeText(options.description)
    }
    if (options.amount) updateData.amount = new Prisma.Decimal(Number(options.amount))
    if (options.direction) updateData.direction = options.direction.toUpperCase()
    if (options.occurredAt) updateData.occurredAt = new Date(options.occurredAt)
    if (options.category) updateData.domainCategoryId = options.category
    if (options.ignored !== undefined) updateData.ignored = options.ignored === "true"

    if (options.merchantName) {
      const displayName = options.merchantName.trim();
      const normalizedName = normalizeText(displayName)?.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase() ?? displayName.toLowerCase();
      const merchant = await prisma.domainMerchant.upsert({
        where: { normalizedName },
        update: { displayName },
        create: { displayName, normalizedName },
      });
      updateData.domainMerchantId = merchant.id;
      updateData.merchantName = displayName;
    }

    await prisma.domainTransaction.update({
      where: { id },
      data: updateData
    })
    log.success(`Transação ${id} atualizada com sucesso!`)
  })

transactionsCommand
  .command("delete <id>")
  .description("Exclui uma transação manual")
  .action(async (id) => {
    const { prisma } = await import("../../lib/prisma.js")
    const existing = await prisma.domainTransaction.findUnique({ where: { id } })
    if (!existing) throw new Error("Transação não encontrada")
    if (existing.sourceProvider !== "MANUAL") {
      throw new Error("Apenas transações manuais podem ser excluídas")
    }
    await prisma.domainTransaction.delete({ where: { id } })
    log.success(`Transação ${id} excluída com sucesso!`)
  })
