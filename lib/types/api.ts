import type { DomainTransactionDirection } from "@prisma/client";

export interface ApiPaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
}

// -----------------------------------------------------------------------------
// Transactions
// -----------------------------------------------------------------------------
export interface Transaction {
  id: string;
  description: string;
  displayTitle?: string;
  displaySubtitle?: string | null;
  rawDescription?: string;
  normalizedDescription?: string | null;
  amount: number;
  date: string;
  direction: DomainTransactionDirection | string;
  categoryName: string;
  categoryId: string | null;
  effectiveCategory?: string;
  parentCategoryName?: string | null;
  accountId: string | null;
  accountName: string;
  accountImageUrl?: string | null;
  merchantId: string | null;
  merchantName: string | null;
  effectiveMerchant?: string | null;
  merchantLogoUrl?: string | null;
  enrichmentStatus?: string | null;
  installmentGroupId?: string | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  currencyCode: string | null;
  ignored: boolean;
}

export interface TransactionsResponse {
  summary: { total: number };
  results: Transaction[];
  meta: ApiPaginationMeta;
}

export interface LookupResponse<T> {
  results: T[];
}

export interface CategoryLookup {
  id: string;
  name: string;
}

export interface AccountLookup {
  id: string;
  name: string;
}

export interface MerchantLookup {
  id: string;
  displayName: string;
}

// -----------------------------------------------------------------------------
// Accounts
// -----------------------------------------------------------------------------
export interface Account {
  id: string;
  name: string;
  kind: string;
  subtype: string;
  balance: number;
  currencyCode: string;
  institution: string;
  number: string;
  providerAccountId: string;
  nickname?: string | null;
  imageUrl?: string | null;
}

export interface AccountsResponse {
  results: Account[];
}

export interface AllocationResult {
  accountId: string;
  name: string;
  kind: string;
  balance: number;
  percentage: number;
}

export interface AllocationResponse {
  summary: {
    totalBalance: number;
    byKind: Record<string, number>;
  };
  results: AllocationResult[];
}

// -----------------------------------------------------------------------------
// Overview / Analytics
// -----------------------------------------------------------------------------
export interface OverviewData {
  accountBalance: number;
  investmentsTotal: number;
  cryptoTotal: number;
  openBills: number;
  fiatAssets: number;
  fiatNetWorth: number;
  cryptoNetWorth: number;
  grossAssets: number;
  netWorth: number;
  monthlyInflow: number;
  monthlyOutflow: number;
  monthlyNet: number;
  periodInflow: number;
  periodOutflow: number;
  periodNet: number;
  loanBalance: number;
  liabilitiesTotal: number;
}

export interface NetWorthHistory {
  current: number;
  points: Array<{
    date: string;
    netWorth: number;
    source: string;
  }>;
}

export interface TransactionsData {
  total: number;
  results: Transaction[];
}

// -----------------------------------------------------------------------------
// Recurring
// -----------------------------------------------------------------------------
export interface RecurringRule {
  id: string;
  description: string;
  amount: number;
  frequency: string;
  category: string;
  categoryId: string | null;
  logoUrl?: string | null;
  merchantName?: string | null;
  nextDate: string;
  type: string;
  occurrences: number;
  lastDate: string | null;
  confidence: number;
  isManual: boolean;
  origin: "detected" | "manual";
  isInstallment?: boolean;
}

export interface RecurringSummary {
  totalMonthlyExpenses: number;
  totalMonthlyIncome: number;
  count: number;
}

export interface RecurringData {
  rules: RecurringRule[];
  summary: RecurringSummary;
}
