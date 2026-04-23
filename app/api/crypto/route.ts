import { Prisma } from "@prisma/client"

import { jsonError, jsonOk } from "@/lib/core/http"
import { getCryptoAssetMetrics } from "@/lib/domain/analytics"
import { getUsdBrlRate } from "@/lib/exchange-rate"

export const dynamic = "force-dynamic"

const USD_QUOTES = new Set(["USDT", "FDUSD", "USDC", "BUSD", "USD"])

function isUsdQuote(quoteAsset: string | null | undefined): boolean {
  if (!quoteAsset) return true
  return USD_QUOTES.has(quoteAsset.toUpperCase())
}

function isBrlQuote(quoteAsset: string | null | undefined): boolean {
  return quoteAsset?.toUpperCase() === "BRL"
}

function toBrl(
  value: Prisma.Decimal | null | undefined,
  quoteAsset: string | null | undefined,
  usdBrlRate: Prisma.Decimal
) {
  if (value == null) return null
  if (isBrlQuote(quoteAsset)) return value
  return isUsdQuote(quoteAsset) ? value.mul(usdBrlRate) : null
}

function toUsd(
  value: Prisma.Decimal | null | undefined,
  quoteAsset: string | null | undefined,
  usdBrlRate: Prisma.Decimal
) {
  if (value == null) return null
  if (isUsdQuote(quoteAsset)) return value
  return isBrlQuote(quoteAsset) ? value.div(usdBrlRate) : null
}

function sumDecimalNumbers(values: Array<number | null | undefined>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const [payload, usdBrl] = await Promise.all([
      getCryptoAssetMetrics(searchParams),
      getUsdBrlRate(),
    ])

    const rate = new Prisma.Decimal(usdBrl)

    const positions = payload.results
      .filter((asset) => asset.currentValue !== null)
      .map((asset) => {
        const valueBrl = toBrl(asset.currentValue, asset.quoteAsset, rate)
        const valueUsd = toUsd(asset.currentValue, asset.quoteAsset, rate)
        const averagePriceBrl = toBrl(asset.averageCost, asset.quoteAsset, rate)
        const averagePriceUsd = toUsd(asset.averageCost, asset.quoteAsset, rate)
        const currentPriceBrl = toBrl(asset.currentPrice, asset.quoteAsset, rate)
        const currentPriceUsd = toUsd(asset.currentPrice, asset.quoteAsset, rate)
        const unrealizedPnlBrl = toBrl(asset.unrealizedPnl, asset.quoteAsset, rate)
        const unrealizedPnlUsd = toUsd(asset.unrealizedPnl, asset.quoteAsset, rate)
        const realizedPnlBrl = toBrl(asset.realizedPnl, asset.quoteAsset, rate)
        const realizedPnlUsd = toUsd(asset.realizedPnl, asset.quoteAsset, rate)

        return {
          asset: asset.asset,
          quantity: asset.quantity,
          averagePriceBrl,
          averagePriceUsd,
          currentPriceBrl,
          currentPriceUsd,
          valueBrl,
          valueUsd,
          unrealizedPnlBrl,
          unrealizedPnlUsd,
          realizedPnlBrl,
          realizedPnlUsd,
          change24hPercent: asset.change24hPercent,
          tradeCount: asset.tradeCount,
          costBasisMissing: asset.costBasisMissing,
          missingCostBasisQuantity: asset.missingCostBasisQuantity,
          firstTradeAt: asset.firstTradeAt,
          lastTradeAt: asset.lastTradeAt,
        }
      })
      .filter((asset) => asset.valueBrl !== null)

    const totalValueBrl = sumDecimalNumbers(positions.map((asset) => asset.valueBrl?.toNumber()))
    const totalValueUsd = sumDecimalNumbers(positions.map((asset) => asset.valueUsd?.toNumber()))
    const totalUnrealizedPnlBrl = sumDecimalNumbers(
      positions.map((asset) => asset.unrealizedPnlBrl?.toNumber())
    )
    const totalUnrealizedPnlUsd = sumDecimalNumbers(
      positions.map((asset) => asset.unrealizedPnlUsd?.toNumber())
    )
    const totalRealizedPnlBrl = sumDecimalNumbers(
      positions.map((asset) => asset.realizedPnlBrl?.toNumber())
    )
    const totalRealizedPnlUsd = sumDecimalNumbers(
      positions.map((asset) => asset.realizedPnlUsd?.toNumber())
    )

    const results = positions.map((asset) => ({
      ...asset,
      portfolioSharePercent:
        totalValueBrl > 0 ? ((asset.valueBrl?.toNumber() ?? 0) / totalValueBrl) * 100 : 0,
    }))

    return jsonOk({
      summary: {
        totalValueBrl,
        totalValueUsd,
        totalUnrealizedPnlBrl,
        totalUnrealizedPnlUsd,
        totalRealizedPnlBrl,
        totalRealizedPnlUsd,
        assetCount: results.length,
        usdBrlRate: usdBrl,
        costBasisMissing: results.some((asset) => asset.costBasisMissing),
        costBasisMissingAssets: results.filter((asset) => asset.costBasisMissing).length,
      },
      results,
      meta: {
        total: payload.total,
        page: payload.page,
        pageSize: payload.pageSize,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
