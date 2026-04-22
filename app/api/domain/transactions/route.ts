import { jsonError, jsonOk } from "@/lib/core/http"
import { getDomainTransactions } from "@/lib/domain/queries"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getDomainTransactions(searchParams)

    const categoryIds = Array.from(
      new Set(
        payload.results
          .map((transaction) => transaction.domainCategoryId)
          .filter((value): value is string => Boolean(value))
      )
    )
    const accountIds = Array.from(
      new Set(
        payload.results
          .map((transaction) => transaction.domainAccountId)
          .filter((value): value is string => Boolean(value))
      )
    )
    const merchantIds = Array.from(
      new Set(
        payload.results
          .map((transaction) => transaction.domainMerchantId)
          .filter((value): value is string => Boolean(value))
      )
    )

    const [categories, accounts, merchants] = await Promise.all([
      prisma.domainCategory.findMany({
        where: categoryIds.length > 0 ? { id: { in: categoryIds } } : { id: "__none__" },
        select: { id: true, name: true },
      }),
      prisma.domainAccount.findMany({
        where: accountIds.length > 0 ? { id: { in: accountIds } } : { id: "__none__" },
        select: { id: true, name: true },
      }),
      prisma.domainMerchant.findMany({
        where: merchantIds.length > 0 ? { id: { in: merchantIds } } : { id: "__none__" },
        select: { id: true, displayName: true },
      }),
    ])

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
    const merchantMap = new Map(merchants.map((merchant) => [merchant.id, merchant.displayName]))

    const mapped = payload.results.map((tx) => ({
      id: tx.id,
      description: tx.description ?? "Sem descrição",
      amount: tx.amount,
      date: tx.occurredAt,
      direction: tx.direction,
      categoryName: tx.domainCategoryId
        ? categoryMap.get(tx.domainCategoryId) ?? "Sem categoria"
        : "Sem categoria",
      categoryId: tx.domainCategoryId,
      accountId: tx.domainAccountId,
      accountName: tx.domainAccountId ? accountMap.get(tx.domainAccountId) ?? "" : "",
      merchantId: tx.domainMerchantId,
      merchantName:
        tx.domainMerchantId
          ? merchantMap.get(tx.domainMerchantId) ?? tx.merchantName ?? null
          : tx.merchantName ?? null,
      currencyCode: tx.currencyCode,
      ignored: tx.ignored,
    }))

    return jsonOk({
      summary: {
        total: payload.total,
      },
      results: mapped,
      meta: {
        page: payload.page,
        pageSize: payload.pageSize,
        totalPages: Math.max(1, Math.ceil(payload.total / payload.pageSize)),
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
