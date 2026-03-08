import { NextResponse } from "next/server"

import { fetchTransaction } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await context.params
  const transaction = await fetchTransaction(transactionId)
  return NextResponse.json(transaction)
}
