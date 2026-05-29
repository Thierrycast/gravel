export type Nudge = {
  type: "WARNING" | "INFO" | string;
  title: string;
  message: string;
};

export type HiddenSubscription = {
  name: string;
  avgGap: number;
  avgAmount: number;
  occurrences: number;
};

export type InsightsResponse = {
  nudges?: Nudge[];
  forensics?: {
    benford?: {
      actual: Array<number | null>;
      ideal: number[];
    };
    hiddenSubs?: HiddenSubscription[];
  };
};

export type OverviewDashboardData = {
  overview: {
    fiat: {
      netWorth: number;
      assets: number;
      investments: number;
    };
    inflow: number;
    outflow: number;
    counts: {
      investments: number;
    };
  };
  categories: {
    results: Array<{
      categoryId: string | null;
      name: string;
      amount: number;
      sharePercent: number;
    }>;
  };
  netWorth: {
    points: Array<{
      date: string;
      netWorth: number;
      scenarioNetWorth?: number;
      assets?: number | null;
      liabilities?: number | null;
    }>;
  };
  cashFlow: {
    results: Array<{
      date: string;
      income: number;
      expense: number;
      investments: number;
      net: number;
    }>;
  };
  transactions: {
    results: Array<{
      id: string;
      description: string;
      amount: number;
      date: string;
      direction?: string;
      category: string;
      categoryId?: string | null;
      accountName: string;
      merchantName?: string | null;
    }>;
  };
  recurring: {
    rules: Array<{
      id: string;
      description: string;
      amount: number;
      frequency: string;
      category: string;
      nextDate: string;
    }>;
    summary: {
      totalMonthly: number;
    };
  };
};
