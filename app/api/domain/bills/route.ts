import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";
import {
  parseDateParam,
  parseNumberParam,
  normalizePagination,
} from "@/lib/core/filters";
import { normalizeBillStatus } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Support "month" param (YYYY-MM) from bills page
    const monthParam = searchParams.get("month");
    let from = parseDateParam(searchParams.get("from"));
    let to = parseDateParam(searchParams.get("to"));

    if (monthParam && !from && !to) {
      const [yearStr, monthStr] = monthParam.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      from = new Date(year, month, 1);
      to = new Date(year, month + 1, 0, 23, 59, 59, 999);
    }

    const page = parseNumberParam(searchParams.get("page"), 1) ?? 1;
    const pageSize = parseNumberParam(searchParams.get("pageSize"), 50) ?? 50;
    const pagination = normalizePagination(page, pageSize);
    const accountId = searchParams.get("accountId") ?? undefined;

    const where = {
      domainAccountId: accountId,
      dueDate: from || to ? { gte: from, lte: to } : undefined,
    };

    const [total, bills, accounts] = await Promise.all([
      prisma.domainBill.count({ where }),
      prisma.domainBill.findMany({
        where,
        orderBy: [{ dueDate: "desc" as const }, { updatedAt: "desc" as const }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.domainAccount.findMany(),
    ]);

    const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

    // Map to UI-expected fields
    const mapped = bills.map((bill) => {
      let paidAt: string | null = null;
      if (bill.metadataJson) {
        try {
          const metadata = JSON.parse(bill.metadataJson) as {
            manualPayment?: { paidAt?: string | null };
          };
          paidAt = metadata.manualPayment?.paidAt ?? null;
        } catch {}
      }

      return {
        id: bill.id,
        accountId: bill.domainAccountId ?? null,
        accountName: bill.domainAccountId
          ? (accountMap.get(bill.domainAccountId) ?? "Conta")
          : "Conta",
        dueDate: bill.dueDate,
        totalAmount: bill.totalAmount,
        minimumPayment: bill.minimumPaymentAmount,
        status: normalizeBillStatus(
          bill.status,
          bill.dueDate,
          bill.totalAmount,
        ),
        paidAt,
        closingDate: null,
      };
    });

    return jsonOk({
      summary: { total },
      results: mapped,
      meta: { page: pagination.page, pageSize: pagination.pageSize },
    });
  } catch (error) {
    return jsonError(error);
  }
}
