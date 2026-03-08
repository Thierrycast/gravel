import { NextResponse } from "next/server"

import { errorResponse, parseNumberParam } from "@/lib/binance-route-helpers"
import { getPersistedBinanceTrades } from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const asset = searchParams.get("asset")
    const take = parseNumberParam(searchParams.get("take"))

    const trades = await getPersistedBinanceTrades({
      symbol,
      asset,
      take,
    })

    return NextResponse.json({
      totalTrades: trades.length,
      results: trades,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
