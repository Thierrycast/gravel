import type { DomainTransactionDirection } from "@prisma/client";

export interface ApiPaginationMeta {
  page: number;
  pageSize: number;
  totalPages: number;
}

// Transactions
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
  isSalary?: boolean;
  isSelfTransfer?: boolean;
  transferFromAccountName?: string | null;
  transferFromAccountImageUrl?: string | null;
  transferToAccountName?: string | null;
  transferToAccountImageUrl?: string | null;
  linkedLend?: {
    id: string;
    friendName: string;
    amount: number;
    dueDate: string;
    status: string;
    role: "loan-outflow" | "payment-inflow";
  } | null;
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
  kind?: string;
}

export interface AccountLookup {
  id: string;
  name: string;
}

export interface MerchantLookup {
  id: string;
  displayName: string;
}

// Accounts
export interface Account {
  id: string;
  name: string;
  originalName?: string | null;
  kind: string;
  subtype: string;
  balance: number;
  currencyCode: string;
  institution: string;
  number: string;
  providerAccountId: string;
  nickname?: string | null;
  imageUrl?: string | null;
  sourceProvider?: string;
  sourceParentId?: string | null;
  ownerName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  transactionCount?: number;
  totalSpent?: number;
  firstTransactionAt?: string | null;
  lastTransactionAt?: string | null;
  billingClosingDay?: number | null;
  billingDueDay?: number | null;
}

export interface AccountsResponse {
  results: Account[];
}

// Credit-card statements (billing cycles) — see lib/domain/billing.ts
export type CardStatementStatus =
  | "PAID"
  | "CLOSED"
  | "OPEN"
  | "FUTURE"
  | "OVERDUE";

export interface CardStatement {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  providerAmount: number | null;
  minimumPayment: number | null;
  status: CardStatementStatus;
  transactionCount: number;
  reconciled: boolean;
  paidAt: string | null;
  providerBillId: string | null;
}

export interface CardStatementsPayload {
  accountId: string;
  accountName: string;
  institutionName: string | null;
  configured: boolean;
  closingDay: number | null;
  dueDay: number | null;
  suggestedDueDay: number | null;
  totalOpen: number;
  current: CardStatement | null;
  upcoming: CardStatement[];
  past: CardStatement[];
}

export interface CardStatementsResponse {
  results: CardStatementsPayload[];
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

// Overview / Analytics
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

// Recurring
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
  currentInstallment?: number;
  totalInstallments?: number;
  installmentRemaining?: number;
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
