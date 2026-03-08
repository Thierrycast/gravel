import { NextResponse } from "next/server"

import { fetchAccountBalance } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await context.params
  const balance = await fetchAccountBalance(accountId)
  return NextResponse.json(balance)
}
