import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/binance-route-helpers"
import {
  getBinancePersistenceSummary,
  syncBinanceData,
  type BinanceSyncResource,
} from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const summary = await getBinancePersistenceSummary()
    return NextResponse.json(summary)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          resources?: BinanceSyncResource[]
          symbols?: string[]
          includeZeroBalances?: boolean
        }
      | null

    const summary = await syncBinanceData({
      resources: Array.isArray(body?.resources) ? body.resources : undefined,
      symbols: Array.isArray(body?.symbols) ? body.symbols : undefined,
      includeZeroBalances: body?.includeZeroBalances === true,
    })

    return NextResponse.json(summary)
  } catch (error) {
    return errorResponse(error)
  }
}
