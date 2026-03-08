import { NextResponse } from "next/server"

import { getPersistedBinanceAssets } from "@/lib/binance-sync"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const binanceAssets = await getPersistedBinanceAssets(false)

  if (binanceAssets.length > 0) {
    return NextResponse.json(
      binanceAssets.map((asset) => ({
        symbol: asset.asset,
        amount: asset.total,
        lastPrice: asset.price,
        priceSymbol: asset.priceSymbol,
        quoteAsset: asset.quoteAsset,
        balanceFetchedAt: asset.balanceFetchedAt,
        priceFetchedAt: asset.priceFetchedAt,
      }))
    )
  }

  const assets = await prisma.cryptoAsset.findMany({
    orderBy: { symbol: "asc" },
  })

  return NextResponse.json(assets)
}
