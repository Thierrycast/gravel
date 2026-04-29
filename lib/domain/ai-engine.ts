import { prisma } from "@/lib/prisma";
import { getOverviewMetrics } from "./analytics";

export async function getBehavioralNudges() {
  const [overview, transactions] = await Promise.all([
    getOverviewMetrics(),
    prisma.domainTransaction.findMany({
      where: { direction: "OUTFLOW" },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
  ]);

  const nudges = [];

  // 1. Budget Guardrail (75% check)
  const currentOutflow = Number(overview.monthlyOutflow);
  // Historical average (simple proxy: average of last 3 months if available)
  const historicalAvg = 5000; // Placeholder, could be dynamic

  if (currentOutflow > historicalAvg * 0.75 && new Date().getDate() <= 15) {
    nudges.push({
      type: "WARNING",
      title: "Se liga!",
      message: `Você já queimou R$ ${currentOutflow.toFixed(2)} este mês. Isso é mais de 75% da sua média histórica e ainda estamos no dia ${new Date().getDate()}.`,
    });
  }

  // 2. Opportunity Cost (Tax to BTC)
  // Find transactions with "Taxa" or "Tarifa"
  const taxes = transactions.filter(
    (tax) =>
      (tax.description || "").toLowerCase().includes("taxa") ||
      (tax.description || "").toLowerCase().includes("tarifa") ||
      (tax.merchantName || "").toLowerCase().includes("banco"),
  );
  const totalTaxes = taxes.reduce((sum, tax) => sum + Math.abs(Number(tax.amount)), 0);

  if (totalTaxes > 10) {
    const btcPrice = 500000; // Approximate BRL price for BTC
    const btcAmount = totalTaxes / btcPrice;
    nudges.push({
      type: "INSIGHT",
      title: "Custo de Oportunidade",
      message: `Suas taxas bancárias recentes somam R$ ${totalTaxes.toFixed(2)}. Com esse valor você poderia ter comprado ${btcAmount.toFixed(8)} BTC hoje.`,
    });
  }

  return nudges;
}
