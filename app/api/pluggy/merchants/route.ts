import { NextResponse } from "next/server"

import { fetchMerchants } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cnpj = searchParams.get("cnpj")

  if (!cnpj) {
    return NextResponse.json(
      { error: "cnpj e obrigatorio" },
      { status: 400 }
    )
  }

  const merchants = await fetchMerchants({ cnpj })
  return NextResponse.json(merchants)
}
