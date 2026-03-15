import { prisma } from "@/lib/prisma"
import { parseDomainQuery } from "@/lib/domain/queries"
import { Prisma } from "@prisma/client"

export const dynamic = "force-dynamic"

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filters = parseDomainQuery(searchParams)

    // Override pageSize to export up to 10000 rows
    searchParams.set("pageSize", "10000")
    searchParams.set("page", "1")

    const where: Prisma.DomainTransactionWhereInput = {
      occurredAt: {
        gte: filters.from,
        lte: filters.to,
      },
      domainAccountId: filters.accountId,
      domainCategoryId: filters.categoryId,
      domainMerchantId: filters.merchantId,
      sourceProvider: filters.provider
        ? (filters.provider as never)
        : undefined,
      ...(searchParams.get("ignored") === "true" ? {} : { ignored: false }),
    }

    const transactions = await prisma.domainTransaction.findMany({
      where,
      orderBy: [
        { occurredAt: filters.sortOrder },
        { createdAt: "desc" },
      ],
      take: 10000,
    })

    // Collect IDs for related data
    const categoryIds = [
      ...new Set(
        transactions
          .map((t) => t.domainCategoryId)
          .filter((id): id is string => id !== null)
      ),
    ]
    const accountIds = [
      ...new Set(
        transactions
          .map((t) => t.domainAccountId)
          .filter((id): id is string => id !== null)
      ),
    ]

    const [categories, accounts] = await Promise.all([
      categoryIds.length
        ? prisma.domainCategory.findMany({
            where: { id: { in: categoryIds } },
          })
        : [],
      accountIds.length
        ? prisma.domainAccount.findMany({
            where: { id: { in: accountIds } },
          })
        : [],
    ])

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]))

    const header = "Data,Descri\u00e7\u00e3o,Valor,Tipo,Categoria,Conta,Comerciante"

    const rows = transactions.map((t) => {
      const date = new Date(t.occurredAt).toLocaleDateString("pt-BR")
      const description = t.description ?? ""
      const amount = t.amount.toString()
      const direction = t.direction === "INFLOW" ? "Entrada" : "Sa\u00edda"
      const category = t.domainCategoryId
        ? categoryMap.get(t.domainCategoryId) ?? ""
        : ""
      const account = t.domainAccountId
        ? accountMap.get(t.domainAccountId) ?? ""
        : ""
      const merchant = t.merchantName ?? ""

      return [date, description, amount, direction, category, account, merchant]
        .map(escapeCsvField)
        .join(",")
    })

    const csv = [header, ...rows].join("\n")

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=transacoes.csv",
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido"
    return new Response(message, { status: 500 })
  }
}
