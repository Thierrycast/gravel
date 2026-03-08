import { NextResponse } from "next/server"

import { createConnectToken } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST() {
  const data = await createConnectToken()
  const accessToken = data?.accessToken ?? data?.connectToken ?? data?.token ?? data

  return NextResponse.json({ accessToken })
}
