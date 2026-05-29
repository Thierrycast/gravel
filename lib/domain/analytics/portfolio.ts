import { Prisma } from "@prisma/client";
import { computeCryptoPositionStates } from "@/lib/domain/crypto-math";
import { getCryptoLogo } from "@/lib/domain/utils";
import { prisma } from "@/lib/prisma";
import {
  buildMetricFilters,
  DAY_MS,
  decimal,
  percentOf,
  safeDivide,
  sumDecimals,
  ZERO,
} from "./shared";

export async function getCryptoAssetMetrics(searchParams: URLSearchParams) {
  const filters = buildMetricFilters(searchParams, {
    period: "all",
    limit: 50,
  });
  const priceHistoryCutoff = new Date(
    (filters.to ?? new Date()).getTime() - DAY_MS,
  );

  const [assetRecords, tradeAssets] = await Promise.all([
    prisma.binanceAssetRecord.findMany({
      where: filters.asset ? { asset: filters.asset } : {},
      select: { asset: true },
    }),
    prisma.binanceTradeRecord.groupBy({
      by: ["baseAsset"],
      where: filters.asset ? { baseAsset: filters.asset } : {},
    }),
  ]);

  const allAssetNames = Array.from(
    new Set([
      ...assetRecords.map((r) => r.asset),
      ...tradeAssets.map((t) => t.baseAsset).filter((a): a is string => !!a),
    ]),
  ).sort();

  const total = allAssetNames.length;

  const [trades, balanceSnapshots, priceSnapshots] = await Promise.all([
    prisma.binanceTradeRecord.findMany({
      where: {
        baseAsset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        tradedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
    }),
    prisma.binanceAssetBalanceSnapshot.findMany({
      where: {
        asset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
    prisma.binanceAssetPriceSnapshot.findMany({
      where: {
        asset: allAssetNames.length > 0 ? { in: allAssetNames } : undefined,
        fetchedAt: {
          lte: filters.to,
        },
      },
      orderBy: [{ fetchedAt: "desc" }],
    }),
  ]);

  const priceMap = new Map<string, (typeof priceSnapshots)[number]>();
  const previousDayPriceMap = new Map<
    string,
    (typeof priceSnapshots)[number]
  >();
  for (const price of priceSnapshots) {
    if (!priceMap.has(price.asset)) {
      priceMap.set(price.asset, price);
    }
    if (
      price.fetchedAt <= priceHistoryCutoff &&
      !previousDayPriceMap.has(price.asset)
    ) {
      previousDayPriceMap.set(price.asset, price);
    }
  }
  const balanceMap = new Map<string, (typeof balanceSnapshots)[number]>();
  for (const balance of balanceSnapshots) {
    if (!balanceMap.has(balance.asset)) {
      balanceMap.set(balance.asset, balance);
    }
  }

  const states = computeCryptoPositionStates(trades, {
    asset: filters.asset,
    from: filters.from,
    to: filters.to,
  });

  const allResults = allAssetNames
    .map((asset) => {
      const state = states.get(asset);
      const price = priceMap.get(asset);
      const previousDayPrice = previousDayPriceMap.get(asset);
      const balance = balanceMap.get(asset);
      const quantity = balance?.total ?? state?.quantity ?? ZERO;
      const currentPrice = price?.price ?? null;
      const currentValue = currentPrice ? currentPrice.mul(quantity) : null;
      const coveredQuantity = state
        ? Prisma.Decimal.min(state.quantity, quantity)
        : ZERO;
      const missingCostBasisQuantity = Prisma.Decimal.max(
        ZERO,
        quantity.minus(coveredQuantity),
      );
      const costBasisMissing =
        quantity.greaterThan(0) && missingCostBasisQuantity.greaterThan(0);
      const coveredCurrentValue =
        currentPrice && coveredQuantity.greaterThan(0)
          ? currentPrice.mul(coveredQuantity)
          : null;
      const totalCostBasis =
        state?.averageCost && coveredQuantity.greaterThan(0)
          ? state.averageCost.mul(coveredQuantity)
          : null;
      const unrealizedPnl =
        coveredCurrentValue && totalCostBasis
          ? coveredCurrentValue.minus(totalCostBasis)
          : null;
      const unrealizedPnlPercent =
        unrealizedPnl && totalCostBasis && !totalCostBasis.equals(0)
          ? unrealizedPnl.div(totalCostBasis).mul(100)
          : null;
      const change24hPercent =
        currentPrice &&
        previousDayPrice?.price &&
        !previousDayPrice.price.equals(0)
          ? currentPrice
              .minus(previousDayPrice.price)
              .div(previousDayPrice.price)
              .mul(100)
          : null;

      return {
        asset,
        imageUrl: getCryptoLogo(asset),
        quoteAsset: price?.quoteAsset ?? state?.quoteAsset ?? null,
        quantity,
        coveredQuantity,
        missingCostBasisQuantity,
        costBasisMissing,
        currentPrice,
        currentValue,
        coveredCurrentValue,
        averageCost: state?.averageCost ?? null,
        totalCostBasis,
        unrealizedPnl,
        unrealizedPnlPercent,
        change24hPercent,
        realizedPnl: state?.realizedPnl ?? ZERO,
        periodRealizedPnl: state?.periodRealizedPnl ?? ZERO,
        periodTradeCount: state?.periodTradeCount ?? 0,
        periodBuyCount: state?.periodBuyCount ?? 0,
        periodSellCount: state?.periodSellCount ?? 0,
        periodBuyQuantity: state?.periodBuyQuantity ?? ZERO,
        periodSellQuantity: state?.periodSellQuantity ?? ZERO,
        averageBuyPrice:
          state && state.periodBuyQuantity.greaterThan(0)
            ? state.periodBuyNotional.div(state.periodBuyQuantity)
            : null,
        averageSellPrice:
          state && state.periodSellQuantity.greaterThan(0)
            ? state.periodSellNotional.div(state.periodSellQuantity)
            : null,
        firstTradeAt: state?.firstTradeAt ?? null,
        lastTradeAt: state?.lastTradeAt ?? null,
        tradeCount: state?.tradeCount ?? 0,
      };
    })
    .sort((left, right) => {
      const valueComparison = decimal(right.currentValue).comparedTo(
        decimal(left.currentValue),
      );
      if (valueComparison !== 0) return valueComparison;
      return left.asset.localeCompare(right.asset);
    });

  const results = allResults.slice(filters.skip, filters.skip + filters.take);
  const totalValue = sumDecimals(allResults.map((item) => item.currentValue));
  const totalCostBasis = sumDecimals(
    allResults.map((item) => item.totalCostBasis),
  );
  const totalUnrealizedPnl = sumDecimals(
    allResults.map((item) => item.unrealizedPnl),
  );
  const costBasisMissingAssets = allResults.filter(
    (item) => item.costBasisMissing,
  ).length;

  return {
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    allResults,
    results,
    summary: {
      totalValue,
      totalCostBasis,
      totalUnrealizedPnl,
      totalUnrealizedPnlPercent: safeDivide(
        totalUnrealizedPnl.mul(100),
        totalCostBasis,
      ),
      costBasisMissing: costBasisMissingAssets > 0,
      costBasisMissingAssets,
      appliedFilters: {
        from: filters.from,
        to: filters.to,
        asset: filters.asset,
      },
    },
  };
}

export async function getCryptoPortfolioMetrics(searchParams: URLSearchParams) {
  const payload = await getCryptoAssetMetrics(searchParams);
  const assets = payload.allResults.filter(
    (asset) => asset.currentValue !== null,
  );
  const totalValue = sumDecimals(assets.map((asset) => asset.currentValue));
  const totalCostBasis = sumDecimals(
    assets.map((asset) => asset.totalCostBasis),
  );
  const totalUnrealizedPnl = sumDecimals(
    assets.map((asset) => asset.unrealizedPnl),
  );
  const totalRealizedPnl = sumDecimals(
    assets.map((asset) => asset.realizedPnl),
  );
  const costBasisMissingAssets = assets.filter(
    (asset) => asset.costBasisMissing,
  ).length;
  const allocations = assets
    .map((asset) => ({
      asset: asset.asset,
      value: asset.currentValue,
      sharePercent: percentOf(decimal(asset.currentValue), totalValue),
    }))
    .sort((left, right) =>
      decimal(right.value).comparedTo(decimal(left.value)),
    );

  const orderedByPnl = [...assets].sort((left, right) =>
    decimal(right.unrealizedPnl).comparedTo(decimal(left.unrealizedPnl)),
  );

  return {
    totalValue,
    totalCostBasis,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalUnrealizedPnlPercent: safeDivide(
      totalUnrealizedPnl.mul(100),
      totalCostBasis,
    ),
    assets: assets.length,
    costBasisMissing: costBasisMissingAssets > 0,
    costBasisMissingAssets,
    allocations,
    bestPerformer: orderedByPnl[0] ?? null,
    worstPerformer: orderedByPnl.at(-1) ?? null,
    appliedFilters: payload.summary.appliedFilters,
  };
}
