import { Prisma } from "@prisma/client";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";
import { getUserSettings } from "../queries";
import { projectNetWorth } from "./net-worth-projection";
import { getOverviewMetrics } from "./overview";
import { buildMetricFilters, sumDecimals } from "./shared";

export async function getNetWorthMetrics(searchParams?: URLSearchParams) {
  const filters = buildMetricFilters(searchParams ?? new URLSearchParams(), {
    period: "12m",
  });
  const [overview, snapshots, usdBrl, settings, activeScenarios, pendingLends] =
    await Promise.all([
      getOverviewMetrics(searchParams),
      prisma.portfolioSnapshot.findMany({
        where: {
          date: {
            gte: filters.from,
            lte: filters.to,
          },
        },
        orderBy: { date: "asc" },
        take: 120,
      }),
      getUsdBrlRate(),
      getUserSettings(searchParams),
      prisma.domainScenarioEvent.findMany({
        where: { isActive: true },
        orderBy: { date: "asc" },
      }),
      prisma.domainLend.findMany({
        where: { status: "PENDING" },
      }),
    ]);

  const rate = new Prisma.Decimal(usdBrl);
  // overview.cryptoTotal já vem convertido para BRL pelo getOverviewMetrics.
  const cryptoAssets = overview.cryptoTotal;

  const totalPendingLends = sumDecimals(pendingLends.map((lend) => lend.amount));

  const grossAssets = overview.fiatAssets
    .plus(cryptoAssets)
    .plus(totalPendingLends);
  const currentNetWorth = overview.fiatNetWorth
    .plus(cryptoAssets)
    .plus(totalPendingLends);

  const points: Array<{
    date: Date;
    netWorth: Prisma.Decimal;
    scenarioNetWorth?: number;
    source: "snapshot" | "current";
    assets?: Prisma.Decimal;
    fiatAssets?: Prisma.Decimal;
    cryptoAssets?: Prisma.Decimal;
    liabilities?: Prisma.Decimal;
  }> = snapshots.map((snapshot) => ({
    date: snapshot.date,
    netWorth: snapshot.netWorth,
    source: "snapshot",
  }));

  points.push({
    date: new Date(),
    netWorth: currentNetWorth,
    assets: grossAssets,
    fiatAssets: overview.fiatAssets,
    cryptoAssets,
    liabilities: overview.liabilitiesTotal,
    source: "current",
  });

  if (
    (settings.showFutureSalary && settings.monthlySalary > 0) ||
    activeScenarios.length > 0
  ) {
    // A projeção vive em ./net-worth-projection.ts, testável sem banco. Antes
    // a linha do cenário era reatribuída à base a cada mês, então um evento só
    // existia no mês em que acontecia.
    const projected = projectNetWorth({
      currentNetWorth,
      monthlySalary: settings.monthlySalary,
      includeSalary: Boolean(settings.showFutureSalary),
      scenarios: activeScenarios,
      lookaheadMonths: 12,
    });

    for (const point of projected) {
      points.push({
        date: point.date,
        netWorth: point.netWorth,
        scenarioNetWorth: point.scenarioNetWorth.toNumber(),
        source: "snapshot",
      });
    }
  }

  return {
    current: currentNetWorth,
    points,
    valuation: {
      fiatAssets: overview.fiatAssets.plus(totalPendingLends),
      accountBalance: overview.accountBalance,
      investmentsTotal: overview.investmentsTotal,
      cryptoAssets,
      grossAssets,
      liabilities: overview.liabilitiesTotal,
      fiatNetWorth: overview.fiatNetWorth.plus(totalPendingLends),
      cryptoNetWorth: cryptoAssets,
      netWorth: currentNetWorth,
      usdBrlRate: rate,
    },
    appliedFilters: {
      from: filters.from,
      to: filters.to,
    },
  };
}
