import { NextResponse } from "next/server";

import { GET as getRecurring } from "../route";

export const dynamic = "force-dynamic";

type RecurringExpensePayload = {
  rules: Array<{ type: string }>;
  summary: {
    totalMonthlyExpenses: number;
    fixedMonthlyExpenses: number;
    installmentMonthlyExpenses: number;
    referenceMonth: string;
  };
  monthlyTotals: Array<{
    month: number;
    fixed: number;
    installments: number;
    total: number;
  }>;
};

export async function GET(request: Request) {
  const recurringResponse = await getRecurring(request);
  if (!recurringResponse.ok) return recurringResponse;

  const recurring = (await recurringResponse.json()) as RecurringExpensePayload;
  const rules = recurring.rules.filter((rule) => rule.type === "EXPENSE");

  return NextResponse.json({
    rules,
    summary: {
      totalMonthlyExpenses: recurring.summary.totalMonthlyExpenses,
      totalMonthly: recurring.summary.totalMonthlyExpenses,
      fixedMonthlyExpenses: recurring.summary.fixedMonthlyExpenses,
      installmentMonthlyExpenses: recurring.summary.installmentMonthlyExpenses,
      referenceMonth: recurring.summary.referenceMonth,
      count: rules.length,
    },
    monthlyTotals: recurring.monthlyTotals,
  });
}
