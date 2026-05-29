import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bitcoin,
  TrendingDown,
  TrendingUp,
  Activity,
  DollarSign,
  Coins,
  ListOrdered,
} from "lucide-react";
import { Prisma } from "@prisma/client";

import { getCryptoAssetMetrics } from "@/lib/domain/analytics";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";
import { formatPercent } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchKlines,
  fetchExchangeInfo,
  selectPreferredTradingSymbol,
} from "@/lib/integrations/binance";

import {
  CryptoAssetChart,
  CryptoCurrencyValue,
  type CryptoAssetChartPoint,
  type CryptoAssetOperationMarker,
} from "./crypto-asset-chart";

// ─── Helpers ────────────────────────────────────────────────
const USD_QUOTES = new Set(["USDT", "FDUSD", "USDC", "BUSD", "USD"]);

function toBrl(
  value: Prisma.Decimal | null | undefined,
  quoteAsset: string | null | undefined,
  rate: Prisma.Decimal,
): number | null {
  if (value == null) return null;
  if (quoteAsset?.toUpperCase() === "BRL") return value.toNumber();
  if (!quoteAsset || USD_QUOTES.has(quoteAsset.toUpperCase()))
    return value.mul(rate).toNumber();
  return null;
}

const qtyFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 });
const dateFmt = new Intl.DateTimeFormat("pt-BR");

type TradeOperation = CryptoAssetOperationMarker & {
  tradedAt: Date;
};

function daysBetween(from: Date, to = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / dayMs));
}

function buildAnalyticalChartData(
  priceData: Array<{ date: string; price: number }>,
  operations: TradeOperation[],
): CryptoAssetChartPoint[] {
  let quantity = 0;
  let costBasis = 0;
  let operationIndex = 0;
  const orderedOperations = [...operations].sort(
    (left, right) => left.tradedAt.getTime() - right.tradedAt.getTime(),
  );

  return priceData.map((point) => {
    const pointEnd = new Date(`${point.date}T23:59:59.999Z`);
    while (
      operationIndex < orderedOperations.length &&
      orderedOperations[operationIndex].tradedAt <= pointEnd
    ) {
      const operation = orderedOperations[operationIndex];
      if (operation.type === "BUY") {
        quantity += operation.quantity;
        costBasis += operation.total;
      } else {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity = Math.max(0, quantity - operation.quantity);
        costBasis = Math.max(0, costBasis - averageCost * operation.quantity);
      }
      operationIndex += 1;
    }

    return {
      date: point.date,
      price: point.price,
      quantity,
      invested: costBasis,
      pnl: quantity > 0 ? point.price * quantity - costBasis : 0,
    };
  });
}

// ─── Server Data Component ─────────────────────────────────
async function AssetOverview({ assetId }: { assetId: string }) {
  const searchParams = new URLSearchParams();
  searchParams.set("asset", assetId);

  const portfolioSearchParams = new URLSearchParams();
  portfolioSearchParams.set("period", "all");

  const [metrics, portfolioMetrics, usdBrl, exchangeInfo, trades] =
    await Promise.all([
      getCryptoAssetMetrics(searchParams),
      getCryptoAssetMetrics(portfolioSearchParams),
      getUsdBrlRate(),
      fetchExchangeInfo(),
      prisma.binanceTradeRecord.findMany({
        where: { baseAsset: assetId },
        orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
      }),
    ]);

  const asset = metrics.results[0];
  if (!asset) notFound();

  const rate = new Prisma.Decimal(usdBrl);

  // Convert Decimals → numbers in BRL
  const currentPriceBrl = toBrl(asset.currentPrice, asset.quoteAsset, rate);
  const avgPriceBrl = toBrl(asset.averageCost, asset.quoteAsset, rate);
  const valueBrl = toBrl(asset.currentValue, asset.quoteAsset, rate);
  const pnlBrl = toBrl(asset.unrealizedPnl, asset.quoteAsset, rate);
  const isPositive = (pnlBrl ?? 0) >= 0;

  // Get trading symbol for the asset
  const tradingInfo = selectPreferredTradingSymbol(assetId, exchangeInfo);
  const quoteAsset = tradingInfo?.quoteAsset ?? "USDT";

  // Fetch historical price data from Binance klines API
  let chartData: { date: string; price: number }[] = [];

  if (tradingInfo?.symbol) {
    try {
      const klines = await fetchKlines({
        symbol: tradingInfo.symbol,
        interval: "1d",
        limit: 90,
      });

      chartData = klines.map((kline) => {
        const closePrice = Number(kline[4]);
        const timestamp = kline[0];
        const date = new Date(timestamp).toISOString().split("T")[0];

        // Convert to BRL if needed
        let priceInBrl = closePrice;
        if (quoteAsset.toUpperCase() === "BRL") {
          priceInBrl = closePrice;
        } else if (
          ["USDT", "FDUSD", "USDC", "BUSD"].includes(quoteAsset.toUpperCase())
        ) {
          priceInBrl = closePrice * Number(rate);
        }

        return { date, price: priceInBrl };
      });
    } catch (error) {
      console.error("Failed to fetch klines:", error);
      // Fallback to database snapshots if API fails
      const history = await prisma.binanceAssetPriceSnapshot.findMany({
        where: { asset: assetId },
        orderBy: { fetchedAt: "asc" },
        select: { fetchedAt: true, price: true, quoteAsset: true },
      });

      chartData = history.map((p) => ({
        date: p.fetchedAt.toISOString().split("T")[0],
        price: toBrl(p.price, p.quoteAsset, rate) ?? Number(p.price),
      }));
    }
  } else {
    // Fallback to database snapshots if no trading symbol found
    const history = await prisma.binanceAssetPriceSnapshot.findMany({
      where: { asset: assetId },
      orderBy: { fetchedAt: "asc" },
      select: { fetchedAt: true, price: true, quoteAsset: true },
    });

    chartData = history.map((p) => ({
      date: p.fetchedAt.toISOString().split("T")[0],
      price: toBrl(p.price, p.quoteAsset, rate) ?? Number(p.price),
    }));
  }

  const operations: TradeOperation[] = trades
    .filter((trade) => trade.tradedAt)
    .map((trade) => {
      const quoteAmount =
        trade.quoteQuantity ?? trade.price.mul(trade.quantity);
      const total =
        toBrl(quoteAmount, trade.quoteAsset, rate) ?? Number(quoteAmount);
      const price =
        toBrl(trade.price, trade.quoteAsset, rate) ?? Number(trade.price);
      return {
        id: trade.id,
        date: trade.tradedAt!.toISOString().split("T")[0],
        tradedAt: trade.tradedAt!,
        type: trade.isBuyer === false ? "SELL" : "BUY",
        quantity: Number(trade.quantity),
        price,
        total,
      };
    });
  const analyticalChartData = buildAnalyticalChartData(chartData, operations);
  const chartStart = chartData[0]?.date;
  const visibleOperations = chartStart
    ? operations.filter((operation) => operation.date >= chartStart)
    : operations;
  const buyOperations = operations.filter(
    (operation) => operation.type === "BUY",
  );
  const minBuy = buyOperations.length
    ? Math.min(...buyOperations.map((operation) => operation.price))
    : null;
  const maxBuy = buyOperations.length
    ? Math.max(...buyOperations.map((operation) => operation.price))
    : null;
  const periodMinPrice = chartData.length
    ? Math.min(...chartData.map((point) => point.price))
    : null;
  const periodMaxPrice = chartData.length
    ? Math.max(...chartData.map((point) => point.price))
    : null;
  const totalPortfolioValue = portfolioMetrics.summary.totalValue;
  const portfolioShare =
    asset.currentValue && !totalPortfolioValue.equals(0)
      ? asset.currentValue.div(totalPortfolioValue).mul(100).toNumber()
      : 0;
  const avgCurrentDiffPercent =
    avgPriceBrl && currentPriceBrl
      ? ((currentPriceBrl - avgPriceBrl) / avgPriceBrl) * 100
      : null;
  const breakEvenMovePercent =
    avgPriceBrl && currentPriceBrl && currentPriceBrl < avgPriceBrl
      ? ((avgPriceBrl - currentPriceBrl) / currentPriceBrl) * 100
      : 0;
  const lastBuy = [...buyOperations].sort(
    (left, right) => right.tradedAt.getTime() - left.tradedAt.getTime(),
  )[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Back + Title */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild className="h-8 w-8">
          <Link href="/crypto">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-card p-2">
          {asset.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.imageUrl}
              alt={`Logo ${asset.asset}`}
              className="size-full object-contain"
            />
          ) : (
            <Bitcoin className="size-6 text-muted-foreground" />
          )}
        </div>
        <PageHeader
          title={asset.asset}
          description={`${qtyFmt.format(asset.quantity.toNumber())} unidades em carteira`}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard
          label="Preço Atual"
          value={<CryptoCurrencyValue value={currentPriceBrl} />}
          icon={Activity}
        />
        <MetricCard
          label="Preço Médio"
          value={
            asset.costBasisMissing
              ? "N/A"
              : <CryptoCurrencyValue value={avgPriceBrl} />
          }
          icon={DollarSign}
        />
        <MetricCard
          label="Valor de Mercado"
          value={<CryptoCurrencyValue value={valueBrl} />}
          icon={Bitcoin}
        />
        <MetricCard
          label="PnL Não Realizado"
          value={
            asset.costBasisMissing
              ? "N/A"
              : <CryptoCurrencyValue value={pnlBrl} />
          }
          icon={isPositive ? TrendingUp : TrendingDown}
          tone={isPositive ? "positive" : "negative"}
        />
        <MetricCard
          label="Quantidade"
          value={qtyFmt.format(asset.quantity.toNumber())}
          icon={Coins}
        />
        <MetricCard
          label="PnL Realizado"
          value={
            asset.costBasisMissing
              ? "N/A"
              : toBrl(asset.realizedPnl, asset.quoteAsset, rate) != null
                ? <CryptoCurrencyValue
                    value={toBrl(asset.realizedPnl, asset.quoteAsset, rate)}
                  />
                : "—"
          }
          icon={isPositive ? TrendingUp : TrendingDown}
          tone={
            toBrl(asset.realizedPnl, asset.quoteAsset, rate) != null &&
            (toBrl(asset.realizedPnl, asset.quoteAsset, rate) ?? 0) < 0
              ? "negative"
              : "positive"
          }
        />
        <MetricCard
          label="Total Investido"
          value={
            asset.costBasisMissing
              ? "N/A"
              : toBrl(asset.totalCostBasis, asset.quoteAsset, rate) != null
                ? <CryptoCurrencyValue
                    value={toBrl(asset.totalCostBasis, asset.quoteAsset, rate)}
                  />
                : "—"
          }
          icon={DollarSign}
        />
        <MetricCard
          label="Participação"
          value={formatPercent(portfolioShare)}
          icon={Activity}
        />
        <MetricCard
          label="Operações"
          value={String(asset.tradeCount)}
          icon={ListOrdered}
        />
      </div>

      {/* Chart + Sidebar */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <section className="surface flex flex-col gap-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Painel analítico
            </h2>
            {chartData.length > 0 ? (
              <CryptoAssetChart
                data={analyticalChartData}
                averagePrice={avgPriceBrl}
                currentPrice={currentPriceBrl}
                operations={visibleOperations}
              />
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground border border-dashed rounded-xl">
                Sem dados históricos disponíveis
              </div>
            )}
          </section>
        </div>

        <div className="md:col-span-1 flex flex-col gap-4">
          <section className="surface flex flex-col gap-3 p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Resumo da posição
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Você tem {qtyFmt.format(asset.quantity.toNumber())} {asset.asset}
              {avgPriceBrl != null ? (
                <>
                  {" "}a preço médio de <CryptoCurrencyValue value={avgPriceBrl} />
                </>
              ) : null}
              .
              {avgCurrentDiffPercent != null
                ? ` O preço atual está ${formatPercent(Math.abs(avgCurrentDiffPercent)).replace("-", "")} ${avgCurrentDiffPercent >= 0 ? "acima" : "abaixo"} do seu médio.`
                : ""}
              {breakEvenMovePercent > 0
                ? ` Precisa subir ${formatPercent(breakEvenMovePercent)} para voltar ao ponto de equilíbrio.`
                : " A posição está no ponto de equilíbrio ou acima dele."}
            </p>
          </section>

          <section className="surface flex flex-col gap-3 p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Insights do ativo
            </h2>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Última compra{" "}
                {lastBuy
                  ? `há ${daysBetween(lastBuy.tradedAt)} dias`
                  : "não identificada"}
                .
              </p>
              {avgCurrentDiffPercent != null && (
                <p>
                  Seu preço médio está{" "}
                  {avgCurrentDiffPercent > 0 ? "abaixo" : "acima"} do valor
                  atual.
                </p>
              )}
              {asset.periodSellCount > 0 ? (
                <p>{asset.periodSellCount} venda(s) no período analisado.</p>
              ) : (
                <p>Nenhuma venda registrada no período analisado.</p>
              )}
            </div>
          </section>

          <section className="surface flex flex-col gap-4 p-6">
            <h2 className="text-lg font-semibold tracking-tight">
              Métricas de Trading
            </h2>
            <div className="flex flex-col gap-4">
              <InfoRow label="Trades Totais" value={String(asset.tradeCount)} />
              <InfoRow
                label="Maior Compra"
                value={
                  maxBuy != null ? <CryptoCurrencyValue value={maxBuy} /> : "N/A"
                }
                border
              />
              <InfoRow
                label="Menor Compra"
                value={
                  minBuy != null ? <CryptoCurrencyValue value={minBuy} /> : "N/A"
                }
                border
              />
              <InfoRow
                label="Mín. do Período"
                value={
                  periodMinPrice != null
                    ? <CryptoCurrencyValue value={periodMinPrice} />
                    : "N/A"
                }
                border
              />
              <InfoRow
                label="Máx. do Período"
                value={
                  periodMaxPrice != null
                    ? <CryptoCurrencyValue value={periodMaxPrice} />
                    : "N/A"
                }
                border
              />
              <InfoRow
                label="Primeiro Trade"
                value={
                  asset.firstTradeAt
                    ? new Date(asset.firstTradeAt).toLocaleDateString("pt-BR")
                    : "N/A"
                }
                border
              />
              <InfoRow
                label="Último Trade"
                value={
                  asset.lastTradeAt
                    ? new Date(asset.lastTradeAt).toLocaleDateString("pt-BR")
                    : "N/A"
                }
              />
            </div>
          </section>
        </div>
      </div>

      <section className="surface flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Histórico de operações
          </h2>
          <span className="text-xs text-muted-foreground">
            {operations.length} registros
          </span>
        </div>
        {operations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-xs uppercase tracking-[0.15em] text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-medium">Data</th>
                  <th className="py-2 text-left font-medium">Tipo</th>
                  <th className="py-2 text-right font-medium">Quantidade</th>
                  <th className="py-2 text-right font-medium">Preço</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...operations]
                  .sort(
                    (left, right) =>
                      right.tradedAt.getTime() - left.tradedAt.getTime(),
                  )
                  .slice(0, 50)
                  .map((operation) => (
                    <tr key={operation.id}>
                      <td className="py-3 text-muted-foreground">
                        {dateFmt.format(operation.tradedAt)}
                      </td>
                      <td className="py-3">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium",
                            operation.type === "BUY"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-rose-500/10 text-rose-400",
                          )}
                        >
                          {operation.type === "BUY" ? "Compra" : "Venda"}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono">
                        {qtyFmt.format(operation.quantity)}
                      </td>
                      <td className="py-3 text-right font-mono">
                        <CryptoCurrencyValue value={operation.price} />
                      </td>
                      <td className="py-3 text-right font-mono font-medium">
                        <CryptoCurrencyValue value={operation.total} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            Nenhuma operação encontrada para este ativo.
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Small UI pieces ────────────────────────────────────────

function InfoRow({
  label,
  value,
  border = true,
}: {
  label: string;
  value: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex justify-between items-center pb-2",
        border && "border-b",
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500 dark:text-emerald-400",
    negative: "text-rose-500 dark:text-rose-400",
  }[tone];

  return (
    <section className="surface flex flex-col justify-between gap-1 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
      </div>
      <p
        className={cn(
          "text-lg sm:text-xl md:text-2xl font-semibold tracking-tight tabular-nums truncate mt-1",
          toneClass,
        )}
      >
        {value}
      </p>
    </section>
  );
}

// ─── Loading skeleton ───────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-96 md:col-span-2 rounded-xl" />
        <Skeleton className="h-96 md:col-span-1 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default async function CryptoAssetPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <Suspense fallback={<LoadingState />}>
      <AssetOverview assetId={assetId.toUpperCase()} />
    </Suspense>
  );
}
