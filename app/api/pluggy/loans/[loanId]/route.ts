import { NextResponse } from "next/server"

import { fetchLoan } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ loanId: string }> }
) {
  const { loanId } = await context.params
  const loan = await fetchLoan(loanId)
  return NextResponse.json(loan)
}
