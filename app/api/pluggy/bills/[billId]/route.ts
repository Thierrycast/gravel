import { NextResponse } from "next/server"

import { fetchBill } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ billId: string }> }
) {
  const { billId } = await context.params
  const bill = await fetchBill(billId)
  return NextResponse.json(bill)
}
