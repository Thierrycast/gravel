import { NextResponse } from "next/server"

import { getApiKey } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST() {
  const apiKey = await getApiKey()
  return NextResponse.json({ apiKey })
}
