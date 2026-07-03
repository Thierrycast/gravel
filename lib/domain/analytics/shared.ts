import {
  DomainTransactionDirection,
  Prisma,
  SourceProvider,
} from "@prisma/client";
import {
  normalizePagination,
  parseBooleanParam,
  parseDateParam,
  parseNumberParam,
} from "@/lib/core/filters";
import { matchesSalaryPatternValues } from "@/lib/domain/salary";

export const ZERO = new Prisma.Decimal(0);
export const DAY_MS = 24 * 60 * 60 * 1000;

export type DecimalLike = Prisma.Decimal | null | undefined;

export type MetricFilters = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  from?: Date;
  to?: Date;
  period?: string;
  accountId?: string;
  categoryId?: string;
  merchantId?: string;
  provider?: SourceProvider;
  asset?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  groupBy: "day" | "week" | "month";
  includeIgnored: boolean;
  limit: number;
  showFutureAccounts: boolean;
};

export function decimal(value?: DecimalLike) {
  return value ?? ZERO;
}

export function sumDecimals(values: DecimalLike[]) {
  return values.reduce(
    (total: Prisma.Decimal, current) => total.plus(decimal(current)),
    ZERO,
  );
}

export function safeDivide(value: Prisma.Decimal, denominator: Prisma.Decimal) {
  if (denominator.equals(0)) return null;
  return value.div(denominator);
}

export function percentOf(value: Prisma.Decimal, total: Prisma.Decimal) {
  if (total.equals(0)) return ZERO;
  return value.div(total).mul(100);
}

export function clampDateToPeriodStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function resolvePeriodStart(period: string | null, to: Date) {
  switch (period) {
    case "7d":
      return new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "90d":
      return new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    case "180d":
      return new Date(to.getTime() - 180 * 24 * 60 * 60 * 1000);
    case "365d":
    case "12m":
      return new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "mtd":
    case "month":
      return clampDateToPeriodStart(to);
    case "ytd":
      return new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
    case "all":
    default:
      return undefined;
  }
}

export function getWeekStart(date: Date) {
  const current = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = current.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  current.setUTCDate(current.getUTCDate() + diff);
  return current;
}

export function formatBucket(date: Date, groupBy: MetricFilters["groupBy"]) {
  if (groupBy === "day") return date.toISOString().slice(0, 10);
  if (groupBy === "week") return getWeekStart(date).toISOString().slice(0, 10);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMetricFilters(
  searchParams: URLSearchParams,
  defaults?: {
    period?: string;
    groupBy?: MetricFilters["groupBy"];
    limit?: number;
  },
) {
  const to = parseDateParam(searchParams.get("to")) ?? new Date();
  const period = searchParams.get("period") ?? defaults?.period;
  const from =
    parseDateParam(searchParams.get("from")) ??
    resolvePeriodStart(period ?? null, to);
  const page = parseNumberParam(searchParams.get("page"), 1) ?? 1;
  const pageSize = parseNumberParam(searchParams.get("pageSize"), 50) ?? 50;
  const pagination = normalizePagination(page, pageSize);
  const providerParam = searchParams.get("provider");

  return {
    ...pagination,
    from,
    to,
    period: period ?? undefined,
    accountId: searchParams.get("accountId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    merchantId: searchParams.get("merchantId") ?? undefined,
    provider: providerParam
      ? (providerParam.toUpperCase() as SourceProvider)
      : undefined,
    asset: searchParams.get("asset")?.toUpperCase() ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
    groupBy:
      searchParams.get("groupBy") === "day"
        ? "day"
        : searchParams.get("groupBy") === "week"
          ? "week"
          : (defaults?.groupBy ?? "month"),
    includeIgnored: parseBooleanParam(searchParams.get("ignored")),
    limit:
      parseNumberParam(searchParams.get("limit"), defaults?.limit ?? 10) ?? 10,
    showFutureAccounts:
      searchParams.get("showFutureAccounts") === null
        ? true
        : parseBooleanParam(searchParams.get("showFutureAccounts")),
  } satisfies MetricFilters;
}

export function buildTransactionWhere(
  filters: MetricFilters,
): Prisma.DomainTransactionWhereInput {
  return {
    occurredAt: {
      gte: filters.from,
      lte: filters.to,
    },
    domainAccountId: filters.accountId,
    domainCategoryId: filters.categoryId,
    domainMerchantId: filters.merchantId,
    sourceProvider: filters.provider,
    ...(filters.includeIgnored ? {} : { ignored: false }),
    ...(!filters.showFutureAccounts ? { installmentGroupId: null } : {}),
  };
}


export const EXCLUDED_SPENDING_CATEGORIES = [
  "pagamento de cartão de crédito",
  "transferência mesma titularidade",
  "transferência entre contas",
  "pagamento de fatura",
  "fatura de cartão",
  "pagamento de fatura de cartão",
  "investimento",
  "aplicação",
  "resgate",
  "aporte",
  "depósito para corretora",
  "transferência - mesma titularidade",
];

export const INVESTMENT_TRANSFER_TERMS = [
  "investimento",
  "aplicação",
  "aplicacao",
  "aporte",
  "corretora",
  "binance",
  "cripto",
  "crypto",
  "tesouro direto",
  "renda fixa",
  "cdb",
  "xp investimento",
  "clear corretora",
  "rico corretora",
];

const INTERNAL_ACCOUNT_TRANSFER_TERMS = [
  "mesma titularidade",
  "entre contas",
  "mesma instituicao",
];

const NON_INCOME_CATEGORY_TERMS = [
  "pagamento de cartao de credito",
  "pagamento de fatura",
  "fatura de cartao",
];

const INACTIVE_INVESTMENT_STATUSES = new Set([
  "CANCELLED",
  "CLOSED",
  "REDEEMED",
  "SOLD",
  "TOTAL_WITHDRAWAL",
  "WITHDRAWN",
]);

function normalizePolicyText(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase() ?? ""
  );
}

export function isInternalTransfer(
  categoryName?: string | null,
  categoryKind?: string | null,
) {
  if (categoryKind === "TRANSFER") return true;
  if (!categoryName) return false;
  const lower = normalizePolicyText(categoryName);
  return EXCLUDED_SPENDING_CATEGORIES.some((excluded) =>
    lower.includes(normalizePolicyText(excluded)),
  );
}

export function isInvestmentTransfer(
  categoryName?: string | null,
  _categoryKind?: string | null,
  description?: string | null,
) {
  const value = normalizePolicyText(
    [categoryName, description].filter(Boolean).join(" "),
  );
  if (!value) return false;
  return INVESTMENT_TRANSFER_TERMS.some((term) =>
    value.includes(normalizePolicyText(term)),
  );
}

export function isInternalAccountTransfer(categoryName?: string | null) {
  const value = normalizePolicyText(categoryName);
  return INTERNAL_ACCOUNT_TRANSFER_TERMS.some((term) => value.includes(term));
}

export type CashFlowClassification =
  | "income"
  | "expense"
  | "investment"
  | "excluded";

export function classifyCashFlowTransaction(
  direction: DomainTransactionDirection | string,
  categoryName?: string | null,
  categoryKind?: string | null,
  description?: string | null,
  options?: {
    salaryPatterns?: string[];
    merchantName?: string | null;
  },
): CashFlowClassification {
  if (direction === DomainTransactionDirection.TRANSFER) return "excluded";

  // Entradas marcadas como salário pelo usuário têm precedência sobre as
  // exclusões de transferência: salário costuma chegar como "Transferência
  // Recebida" com categoria "mesma titularidade" e seria descartado.
  if (
    direction === DomainTransactionDirection.INFLOW &&
    options?.salaryPatterns?.length &&
    matchesSalaryPatternValues(
      [description, options.merchantName],
      options.salaryPatterns,
    )
  ) {
    return "income";
  }

  if (isInvestmentTransfer(categoryName, categoryKind, description)) {
    return "investment";
  }

  if (direction === DomainTransactionDirection.INFLOW) {
    const category = normalizePolicyText(categoryName);
    if (isInternalAccountTransfer(categoryName)) return "excluded";
    if (NON_INCOME_CATEGORY_TERMS.some((term) => category.includes(term))) {
      return "excluded";
    }
    return "income";
  }

  if (direction === DomainTransactionDirection.OUTFLOW) {
    return isInternalTransfer(categoryName, categoryKind)
      ? "excluded"
      : "expense";
  }

  return "excluded";
}

export function isActiveInvestmentPosition(
  balance: DecimalLike,
  status?: string | null,
) {
  const normalizedStatus = status?.trim().toUpperCase();
  return (
    decimal(balance).abs().greaterThan(0) &&
    !INACTIVE_INVESTMENT_STATUSES.has(normalizedStatus ?? "")
  );
}

export function isRealSpending(
  categoryName: string | undefined,
  categoryKind: string | undefined,
): boolean {
  return !isInternalTransfer(categoryName, categoryKind);
}

export function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function normalizeBillStatus(
  status: string | null | undefined,
  dueDate: Date | null | undefined,
  totalAmount?: DecimalLike,
  now = new Date(),
) {
  const normalized = status?.trim().toUpperCase();
  const total = decimal(totalAmount);

  if (normalized === "PAID" || normalized === "SETTLED") return "PAID";
  if (total.lessThanOrEqualTo(0)) return "CLOSED";
  if (!dueDate) return normalized === "CLOSED" ? "CLOSED" : "OPEN";

  const dueDay = startOfLocalDay(dueDate);
  const today = startOfLocalDay(now);

  if (dueDay < today) {
    if (normalized === "CLOSED") return "CLOSED";
    return "OVERDUE";
  }

  // Future due date: "CLOSED" from the source means the billing cycle closed
  // but the bill hasn't been paid — treat as OPEN so users see it correctly.
  return "OPEN";
}

export function isOutstandingBill(
  status: string | null | undefined,
  dueDate: Date | null | undefined,
  totalAmount?: DecimalLike,
  now = new Date(),
) {
  const normalized = normalizeBillStatus(status, dueDate, totalAmount, now);
  return normalized === "OPEN" || normalized === "OVERDUE";
}

export function isSalaryLikeTransaction({
  categoryName,
  parentCategoryName,
  description,
  merchantName,
  salaryPatterns,
}: {
  categoryName?: string | null;
  parentCategoryName?: string | null;
  description?: string | null;
  merchantName?: string | null;
  salaryPatterns: string[];
}): boolean {
  const normCat = `${categoryName ?? ""} ${parentCategoryName ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (
    normCat.includes("seed-salary") ||
    normCat.includes("salario") ||
    normCat.includes("salary")
  ) {
    return true;
  }
  if (salaryPatterns.length === 0) return false;
  const lookup = [description, merchantName]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!lookup) return false;
  return salaryPatterns.some((pattern) => {
    const p = pattern
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    return p.length > 0 && (lookup.includes(p) || p.includes(lookup));
  });
}
