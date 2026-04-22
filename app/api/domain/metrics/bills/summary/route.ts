import { jsonError, jsonOk } from "@/lib/core/http"
import { getBillsSummaryMetrics } from "@/lib/domain/analytics"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Support "month" param (YYYY-MM) from bills page
    const monthParam = searchParams.get("month")
    if (monthParam && !searchParams.has("from") && !searchParams.has("to") && !searchParams.has("period")) {
      const [yearStr, monthStr] = monthParam.split("-")
      const year = Number(yearStr)
      const month = Number(monthStr) - 1
      searchParams.set("from", new Date(year, month, 1).toISOString().split("T")[0])
      searchParams.set("to", new Date(year, month + 1, 0).toISOString().split("T")[0])
    }

    const summary = await getBillsSummaryMetrics(searchParams)
    const accounts = await prisma.domainAccount.findMany()
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]))

    const now = new Date()
    const openAmount = summary.totalAmount.minus(summary.overdueAmount)
    const paidBills = summary.upcoming.filter((b) => b.status === "PAID" || b.status === "CLOSED")
    const openBills = summary.upcoming.filter((b) => b.status !== "PAID" && b.status !== "CLOSED" && b.dueDate && b.dueDate >= now)
    const overdueBills = summary.upcoming.filter((b) => b.status !== "PAID" && b.status !== "CLOSED" && b.dueDate && b.dueDate < now)

    // Map upcoming bills with account names
    const mappedUpcoming = summary.upcoming.map((bill) => ({
      id: bill.id,
      accountName: bill.domainAccountId ? accountMap.get(bill.domainAccountId) ?? "Conta" : "Conta",
      dueDate: bill.dueDate,
      totalAmount: bill.totalAmount,
      minimumPayment: bill.minimumPaymentAmount,
      status: bill.status ?? "OPEN",
      closingDate: null,
    }))

    return jsonOk({
      summary: {
        totalOpen: openAmount,
        totalOverdue: summary.overdueAmount,
        totalPaid: summary.totalAmount, // Total of all bills
        counts: {
          total: summary.counts.bills,
          open: openBills.length,
          overdue: summary.counts.overdue,
          paid: paidBills.length,
        },
        upcoming: mappedUpcoming,
      },
      results: mappedUpcoming,
    })
  } catch (error) {
    return jsonError(error)
  }
}
