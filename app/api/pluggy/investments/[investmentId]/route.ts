import { NextResponse } from "next/server"

import { fetchInvestment } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ investmentId: string }> }
) {
  const { investmentId } = await context.params
  const investment = await fetchInvestment(investmentId)
  return NextResponse.json(investment)
}
