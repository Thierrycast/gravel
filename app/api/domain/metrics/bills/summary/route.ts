import { jsonError, jsonOk } from "@/lib/core/http";
import {
  getBillsSummaryMetrics,
  normalizeBillStatus,
} from "@/lib/domain/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Support "month" param (YYYY-MM) from bills page
    const monthParam = searchParams.get("month");
    if (
      monthParam &&
      !searchParams.has("from") &&
      !searchParams.has("to") &&
      !searchParams.has("period")
    ) {
      const [yearStr, monthStr] = monthParam.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      searchParams.set(
        "from",
        new Date(year, month, 1).toISOString().split("T")[0],
      );
      searchParams.set(
        "to",
        new Date(year, month + 1, 0).toISOString().split("T")[0],
      );
    }

    const summary = await getBillsSummaryMetrics(searchParams);
    const accounts = await prisma.domainAccount.findMany();
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

    const NOISE_THRESHOLD = 0.01;

    // Map upcoming bills with account names
    const mappedUpcoming = summary.upcoming
      .filter((bill) => Math.abs(Number(bill.totalAmount)) >= NOISE_THRESHOLD)
      .map((bill) => ({
        id: bill.id,
        accountName: (
          bill.domainAccountId
            ? (accountMap.get(bill.domainAccountId) ?? "Conta")
            : "Conta"
        ).trim(),
        dueDate: bill.dueDate,
        totalAmount: bill.totalAmount,
        minimumPayment: bill.minimumPaymentAmount,
        status: normalizeBillStatus(bill.status, bill.dueDate, bill.totalAmount),
        closingDate: null,
      }));

    return jsonOk({
      summary: {
        totalOpen: summary.openAmount,
        totalOverdue: summary.overdueAmount,
        totalPaid: summary.paidAmount,
        counts: {
          total: summary.counts.bills,
          open: summary.counts.open,
          overdue: summary.counts.overdue,
          paid: summary.counts.paid,
        },
        upcoming: mappedUpcoming,
      },
      results: mappedUpcoming,
    });
  } catch (error) {
    return jsonError(error);
  }
}
