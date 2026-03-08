import { NextResponse } from "next/server"

import { errorResponse, parseBooleanParam } from "@/lib/binance-route-helpers"
import { getPersistedBinanceAssets } from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeZeroBalances = parseBooleanParam(
      searchParams.get("includeZeroBalances")
    )

    const assets = await getPersistedBinanceAssets(includeZeroBalances)
    return NextResponse.json({
      totalAssets: assets.length,
      results: assets,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
