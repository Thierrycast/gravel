import { NextResponse } from "next/server"

import { fetchItems } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET() {
  const items = await fetchItems()
  return NextResponse.json(items)
}
