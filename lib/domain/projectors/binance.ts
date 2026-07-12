import { OpsRunStatus, SourceProvider } from "@prisma/client";
import { markDomainSyncState } from "@/lib/admin/ops";
import { computeCryptoPositionStates } from "@/lib/domain/crypto-math";
import { prisma } from "@/lib/prisma";

export async function projectBinanceReadModels() {
  const latestBalances = await prisma.binanceAssetRecord.findMany({
    orderBy: { asset: "asc" },
  });
  const tradeAggregates = computeCryptoPositionStates(
    await prisma.binanceTradeRecord.findMany({
      select: {
        baseAsset: true,
        quoteAsset: true,
        price: true,
        quantity: true,
        commission: true,
        commissionAsset: true,
        isBuyer: true,
        tradedAt: true,
      },
      orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
    }),
  );

  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const asset of latestBalances) {
      const balance = await tx.binanceAssetBalanceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      });
      if (!balance) continue;

      const price = await tx.binanceAssetPriceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      });

      const aggregate = tradeAggregates.get(asset.asset);
      const avgCost = aggregate?.averageCost ?? null;
      const currentValue = price?.price ? price.price.mul(balance.total) : null;
      const currentCost = avgCost ? avgCost.mul(balance.total) : null;
      const pnl =
        currentValue && currentCost ? currentValue.minus(currentCost) : null;

      await tx.domainCryptoAsset.upsert({
        where: { asset: asset.asset },
        update: {
          quantity: balance.total,
          price: price?.price ?? undefined,
          value: currentValue ?? undefined,
          quoteAsset: price?.quoteAsset ?? undefined,
          costBasis: avgCost ?? undefined,
          pnlUnrealized: pnl ?? undefined,
          metadataJson: JSON.stringify({
            balanceSnapshotId: balance.id,
            priceSnapshotId: price?.id,
            totalCostBasis: currentCost,
            realizedPnl: aggregate?.realizedPnl ?? null,
            lastTradeAt: aggregate?.lastTradeAt ?? null,
            firstTradeAt: aggregate?.firstTradeAt ?? null,
            tradeCount: aggregate?.tradeCount ?? 0,
          }),
        },
        create: {
          asset: asset.asset,
          quantity: balance.total,
          price: price?.price ?? undefined,
          value: currentValue ?? undefined,
          quoteAsset: price?.quoteAsset ?? undefined,
          sourceProvider: SourceProvider.BINANCE,
          sourceExternalId: asset.asset,
          costBasis: avgCost ?? undefined,
          pnlUnrealized: pnl ?? undefined,
          metadataJson: JSON.stringify({
            balanceSnapshotId: balance.id,
            priceSnapshotId: price?.id,
            totalCostBasis: currentCost,
            realizedPnl: aggregate?.realizedPnl ?? null,
            lastTradeAt: aggregate?.lastTradeAt ?? null,
            firstTradeAt: aggregate?.firstTradeAt ?? null,
            tradeCount: aggregate?.tradeCount ?? 0,
          }),
        },
      });

      projected += 1;
    }
  }, { maxWait: 15_000, timeout: 120_000 });

  await markDomainSyncState({
    stateKey: "domain:binance:crypto-assets",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return { cryptoAssets: projected };
}
