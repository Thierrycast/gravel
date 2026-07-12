import { Prisma } from "@prisma/client";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { prisma } from "@/lib/prisma";
import { getUserSettings } from "../queries";
import { getOverviewMetrics } from "./overview";
import { buildMetricFilters, decimal, sumDecimals } from "./shared";

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
    let projectedNW = currentNetWorth;
    let scenarioNW = currentNetWorth;
    const now = new Date();

    const lookaheadMonths = 12;

    for (let i = 1; i <= lookaheadMonths; i++) {
      const projDate = new Date(now);
      projDate.setMonth(projDate.getMonth() + i);
      projDate.setDate(1);

      const monthStart = new Date(
        projDate.getFullYear(),
        projDate.getMonth(),
        1,
      );
      const monthEnd = new Date(
        projDate.getFullYear(),
        projDate.getMonth() + 1,
        0,
      );

      if (settings.showFutureSalary) {
        projectedNW = projectedNW.plus(
          new Prisma.Decimal(settings.monthlySalary),
        );
      }

      scenarioNW = projectedNW;

      const monthScenarios = activeScenarios.filter((scenario) => {
        const date = new Date(scenario.date);
        return date >= monthStart && date <= monthEnd;
      });

      for (const scenario of monthScenarios) {
        scenarioNW = scenarioNW.plus(decimal(scenario.amount));
      }

      points.push({
        date: projDate,
        netWorth: projectedNW,
        scenarioNetWorth: scenarioNW.toNumber(),
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
