import { jsonError, jsonOk } from "@/lib/core/http";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const USD_QUOTES = new Set(["USDT", "FDUSD", "USDC", "BUSD", "USD"]);

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Evolução diária do valor da carteira cripto reconstruída a partir dos
 * snapshots de saldo e preço da Binance (forward-fill: na ausência de
 * snapshot no dia, vale o último conhecido). Conversão USD→BRL usa a taxa
 * atual — a taxa histórica não é armazenada.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(
      Math.max(Number(searchParams.get("days")) || 90, 7),
      365,
    );
    const now = new Date();
    const from = new Date(now.getTime() - days * DAY_MS);

    const [balances, prices, usdBrl] = await Promise.all([
      prisma.binanceAssetBalanceSnapshot.findMany({
        where: { fetchedAt: { gte: from } },
        orderBy: { fetchedAt: "asc" },
        select: { asset: true, total: true, fetchedAt: true },
      }),
      prisma.binanceAssetPriceSnapshot.findMany({
        where: { fetchedAt: { gte: from } },
        orderBy: { fetchedAt: "asc" },
        select: {
          asset: true,
          price: true,
          quoteAsset: true,
          fetchedAt: true,
        },
      }),
      getUsdBrlRate(),
    ]);

    // Última leitura de cada dia, por ativo.
    const balanceByAssetDay = new Map<string, Map<string, number>>();
    for (const snap of balances) {
      const key = dayKey(snap.fetchedAt);
      let perDay = balanceByAssetDay.get(snap.asset);
      if (!perDay) {
        perDay = new Map();
        balanceByAssetDay.set(snap.asset, perDay);
      }
      perDay.set(key, Number(snap.total));
    }
    const priceByAssetDay = new Map<
      string,
      Map<string, { price: number; quoteAsset: string | null }>
    >();
    for (const snap of prices) {
      const key = dayKey(snap.fetchedAt);
      let perDay = priceByAssetDay.get(snap.asset);
      if (!perDay) {
        perDay = new Map();
        priceByAssetDay.set(snap.asset, perDay);
      }
      perDay.set(key, {
        price: Number(snap.price),
        quoteAsset: snap.quoteAsset,
      });
    }

    const assets = new Set<string>([
      ...balanceByAssetDay.keys(),
      ...priceByAssetDay.keys(),
    ]);

    const rate = Number(usdBrl);
    const series: Array<{ date: string; valueBrl: number }> = [];
    const lastBalance = new Map<string, number>();
    const lastPrice = new Map<
      string,
      { price: number; quoteAsset: string | null }
    >();

    for (let t = from.getTime(); t <= now.getTime(); t += DAY_MS) {
      const key = dayKey(new Date(t));
      let total = 0;
      let hasData = false;
      for (const asset of assets) {
        const balance = balanceByAssetDay.get(asset)?.get(key);
        if (balance !== undefined) lastBalance.set(asset, balance);
        const price = priceByAssetDay.get(asset)?.get(key);
        if (price !== undefined) lastPrice.set(asset, price);

        const qty = lastBalance.get(asset);
        const px = lastPrice.get(asset);
        if (qty === undefined || px === undefined || qty === 0) continue;
        const quote = px.quoteAsset?.toUpperCase() ?? "USDT";
        const brl =
          quote === "BRL"
            ? qty * px.price
            : USD_QUOTES.has(quote)
              ? qty * px.price * rate
              : 0;
        total += brl;
        hasData = true;
      }
      if (hasData) {
        series.push({ date: key, valueBrl: Math.round(total * 100) / 100 });
      }
    }

    const first = series[0]?.valueBrl ?? 0;
    const last = series.at(-1)?.valueBrl ?? 0;
    const peak = series.reduce((max, p) => Math.max(max, p.valueBrl), 0);
    const trough = series.reduce(
      (min, p) => Math.min(min, p.valueBrl),
      series[0]?.valueBrl ?? 0,
    );

    return jsonOk({
      summary: {
        days,
        changeBrl: Math.round((last - first) * 100) / 100,
        changePct:
          first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : null,
        peakBrl: Math.round(peak * 100) / 100,
        troughBrl: Math.round(trough * 100) / 100,
        usdBrlRate: rate,
      },
      results: series,
    });
  } catch (error) {
    return jsonError(error);
  }
}
