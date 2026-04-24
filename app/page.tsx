import {
  getOverviewMetrics,
  getSpendingByCategoryMetrics,
  getNetWorthMetrics,
} from "@/lib/domain/analytics";
import { getDashboardTransactions } from "@/lib/domain/queries";
import { getDashboardRecurring } from "@/lib/domain/derived";
import { getUsdBrlRate } from "@/lib/exchange-rate";
import { ensurePrismaReady } from "@/lib/prisma";
import { OverviewDashboard } from "./overview-dashboard";
import { serializeDomain } from "@/lib/core/serialization";
import { getMerchantLogo } from "@/lib/domain/utils";
import { Prisma } from "@prisma/client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // Convert params to URLSearchParams for domain functions
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      urlParams.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((v) => urlParams.append(key, v));
    }
  });

  await ensurePrismaReady();

  // Parallel fetch everything directly from the domain layer (bypassing internal API)
  const [overview, categories, netWorth, transactions, recurring, usdBrlRate] =
    await Promise.all([
      getOverviewMetrics(urlParams),
      getSpendingByCategoryMetrics(urlParams),
      getNetWorthMetrics(urlParams),
      getDashboardTransactions(urlParams),
      getDashboardRecurring(),
      getUsdBrlRate(),
    ]);
  const cryptoTotalBrl = overview.cryptoTotal.mul(new Prisma.Decimal(usdBrlRate));

  const initialData = serializeDomain({
    overview: {
      fiat: {
        netWorth: overview.fiatNetWorth.plus(cryptoTotalBrl),
        assets: overview.fiatAssets.plus(cryptoTotalBrl),
        investments: overview.investmentsTotal,
      },
      inflow: overview.periodInflow,
      outflow: overview.periodOutflow,
      counts: {
        investments: overview.counts.investments,
      },
    },
    categories: {
      results: categories.results.slice(0, 5),
    },
    netWorth: {
      points: netWorth.points,
    },
    transactions: {
      results: transactions.results.slice(0, 5).map((transaction) => ({
        ...transaction,
        category: transaction.categoryName,
      })),
    },
    recurring: {
      rules: recurring.rules.map((rule) => ({
        id: rule.id,
        description: rule.description,
        amount: rule.amount ?? 0,
        frequency: rule.frequency,
        category: rule.category,
        nextDate: rule.nextDate,
        merchantName: rule.merchantName,
        logoUrl: rule.logoUrl ?? getMerchantLogo(rule.merchantName || rule.description),
      })),
      summary: {
        totalMonthly: recurring.summary.totalMonthly,
      },
    },
  });

  return (
    <div className="container mx-auto py-6">
      <OverviewDashboard initialData={initialData} />
    </div>
  );
}
