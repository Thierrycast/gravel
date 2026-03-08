import { NextResponse } from "next/server"

import { createApiKey } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST() {
  const data = await createApiKey()
  return NextResponse.json(data)
}
