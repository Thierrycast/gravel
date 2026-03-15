import { NextResponse } from "next/server"

import { getCryptoAssetMetrics } from "@/lib/domain/analytics"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const payload = await getCryptoAssetMetrics(searchParams)

  return NextResponse.json(
    payload.results.map((asset) => ({
      symbol: asset.asset,
      amount: asset.quantity,
      lastPrice: asset.currentPrice,
      quoteAsset: asset.quoteAsset,
      currentValue: asset.currentValue,
      avgPrice: asset.averageCost,
      pnlUnrealized: asset.unrealizedPnl,
      pnlRealized: asset.realizedPnl,
      tradeCount: asset.tradeCount,
      firstTradeAt: asset.firstTradeAt,
      lastTradeAt: asset.lastTradeAt,
    }))
  )
}
