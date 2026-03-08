import { NextResponse } from "next/server"

import { fetchCategories } from "@/lib/integrations/pluggy"
import { parseNumberParam } from "@/lib/pluggy-route-helpers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const categories = await fetchCategories({
    page: parseNumberParam(searchParams.get("page")),
    pageSize: parseNumberParam(searchParams.get("pageSize")),
  })

  return NextResponse.json(categories)
}
