import { NextResponse } from "next/server"

import { fetchAccount } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await context.params
  const account = await fetchAccount(accountId)
  return NextResponse.json(account)
}
