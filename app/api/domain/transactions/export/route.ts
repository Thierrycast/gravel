import { getDomainTransactions } from "@/lib/domain/queries"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // Always export everything matching the current filters (up to 10000 for safety)
    searchParams.set("page", "1")
    searchParams.set("pageSize", "10000")
    
    const payload = await getDomainTransactions(searchParams)

    // Lookup data for labels
    const categoryIds = Array.from(new Set(payload.results.map(tx => tx.domainCategoryId).filter(Boolean)))
    const accountIds = Array.from(new Set(payload.results.map(tx => tx.domainAccountId).filter(Boolean)))
    const merchantIds = Array.from(new Set(payload.results.map(tx => tx.domainMerchantId).filter(Boolean)))

    const [categories, accounts, merchants] = await Promise.all([
      prisma.domainCategory.findMany({ where: { id: { in: categoryIds as string[] } } }),
      prisma.domainAccount.findMany({ where: { id: { in: accountIds as string[] } } }),
      prisma.domainMerchant.findMany({ where: { id: { in: merchantIds as string[] } } }),
    ])

    const catMap = new Map(categories.map(c => [c.id, c.name]))
    const accMap = new Map(accounts.map(a => [a.id, a.name]))
    const merMap = new Map(merchants.map(m => [m.id, m.displayName]))

    // CSV Header
    const headers = ["Data", "Descrição", "Valor", "Direção", "Conta", "Categoria", "Comerciante"]
    const rows = payload.results.map(tx => {
      const amount = Number(tx.amount)
      const signedAmount = tx.direction === "INFLOW" ? Math.abs(amount) : -Math.abs(amount)
      
      return [
        tx.occurredAt.toISOString().split("T")[0],
        `"${(tx.description || "").replace(/"/g, '""')}"`,
        signedAmount.toFixed(2),
        tx.direction,
        `"${(tx.domainAccountId ? accMap.get(tx.domainAccountId) || "" : "").replace(/"/g, '""')}"`,
        `"${(tx.domainCategoryId ? catMap.get(tx.domainCategoryId) || "" : "").replace(/"/g, '""')}"`,
        `"${(tx.domainMerchantId ? merMap.get(tx.domainMerchantId) || tx.merchantName || "" : tx.merchantName || "").replace(/"/g, '""')}"`,
      ].join(",")
    })

    const csv = [headers.join(","), ...rows].join("\n")

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gravel-transactions-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error("Export error", error)
    return new Response("Export failed", { status: 500 })
  }
}
