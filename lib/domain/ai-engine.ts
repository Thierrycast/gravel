import { prisma } from "@/lib/prisma";
import { getOverviewMetrics } from "./analytics";

export async function getBehavioralNudges() {
  const now = new Date();
  const historyStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const historyEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [overview, transactions, historyTransactions, btcSnapshot] = await Promise.all([
    getOverviewMetrics(),
    prisma.domainTransaction.findMany({
      where: { ignored: false, direction: "OUTFLOW" },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    prisma.domainTransaction.findMany({
      where: { ignored: false, direction: "OUTFLOW", occurredAt: { gte: historyStart, lte: historyEnd } },
      select: { amount: true },
    }),
    prisma.binanceAssetPriceSnapshot.findFirst({
      where: { symbol: "BTCBRL" },
      orderBy: { fetchedAt: "desc" },
    }),
  ]);

  const nudges = [];

  // 1. Budget Guardrail (75% check)
  const currentOutflow = Number(overview.monthlyOutflow);
  const historyTotal = historyTransactions.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const historicalAvg = historyTotal > 0 ? historyTotal / 3 : null;

  if (historicalAvg !== null && currentOutflow > historicalAvg * 0.75 && now.getDate() <= 15) {
    nudges.push({
      type: "WARNING",
      title: "Se liga!",
      message: `Você já queimou R$ ${currentOutflow.toFixed(2)} este mês. Isso é mais de 75% da sua média histórica de R$ ${historicalAvg.toFixed(2)} e ainda estamos no dia ${now.getDate()}.`,
    });
  }

  // 2. Opportunity Cost (Tax to BTC)
  const taxes = transactions.filter(
    (tax) =>
      (tax.description || "").toLowerCase().includes("taxa") ||
      (tax.description || "").toLowerCase().includes("tarifa") ||
      (tax.merchantName || "").toLowerCase().includes("banco"),
  );
  const totalTaxes = taxes.reduce((sum, tax) => sum + Math.abs(Number(tax.amount)), 0);

  if (totalTaxes > 10) {
    const btcPrice = btcSnapshot ? Number(btcSnapshot.price) : 500000;
    const btcAmount = totalTaxes / btcPrice;
    nudges.push({
      type: "INSIGHT",
      title: "Custo de Oportunidade",
      message: `Suas taxas bancárias recentes somam R$ ${totalTaxes.toFixed(2)}. Com esse valor você poderia ter comprado ${btcAmount.toFixed(8)} BTC hoje.`,
    });
  }

  return nudges;
}
