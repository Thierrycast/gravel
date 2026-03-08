import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/binance-route-helpers"
import { getTrackedBinanceSymbols } from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const symbols = await getTrackedBinanceSymbols()
    return NextResponse.json({
      totalSymbols: symbols.length,
      results: symbols,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
