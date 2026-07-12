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
    case "lastMonth":
      return new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
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
  let to = parseDateParam(searchParams.get("to")) ?? new Date();
  const period = searchParams.get("period") ?? defaults?.period;

  if (period === "lastMonth") {
    const startOfCurrentMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
    to = new Date(startOfCurrentMonth.getTime() - 1);
  }

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
  "pagamento recebido", // Ficha 1
  "valor adicionado na conta por cartao de credito", // Ficha 2
  "valor adicionado para pix no credito", // Ficha 2
  // Ficha 3 revertida por regra de negócio do usuário: depósitos lançados pelo banco
  // como "Depósito de dinheiro" devem contar como entrada nova no sistema rastreado,
  // porque esse valor não é duplicado manualmente fora do banco.
];

// Saídas que são pagamento de fatura de cartão: o dinheiro sai da conta para
// quitar o cartão, mas as compras do cartão já contam como despesa uma a uma.
// Contar o pagamento também dobraria o gasto do mês.
const CARD_PAYMENT_OUTFLOW_TERMS = [
  "pagamento de fatura",
  "pagamento fatura",
  "pagto fatura",
  "pagto. fatura",
  "pagamento de cartao de credito",
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
  _categoryKind?: string | null,
) {
  void _categoryKind;
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

// Frases que denunciam uma transferência bancária (PIX/TED/DOC). Usadas para
// extrair o nome do contraparte e parear as duas pernas de uma movimentação
// entre contas próprias.
const TRANSFER_PHRASE_TERMS = [
  "pix enviado",
  "pix recebido",
  "transferencia recebida",
  "transferencia enviada",
  "transferencia pix",
  "ted recebida",
  "ted enviada",
  "doc recebido",
  "doc enviado",
  "transferencia",
];

// Extrai o nome do contraparte de uma descrição de transferência. Ex.:
//   "Transferência Recebida|THIERRY BARRETO DE CASTRO" -> "thierry barreto de castro"
//   "Pix enviado - Thierry Barreto De Castro"          -> "thierry barreto de castro"
//   "Transferência Recebida|67.037.195 THIERRY ..."    -> "thierry ..."
// Retorna null quando a descrição não é uma transferência ou não tem um nome
// com pelo menos dois tokens (evita casar termos genéricos).
export function extractTransferCounterparty(
  description?: string | null,
): string | null {
  const normalized = normalizePolicyText(description);
  if (!normalized) return null;
  if (!TRANSFER_PHRASE_TERMS.some((term) => normalized.includes(term))) {
    return null;
  }

  const raw = description ?? "";
  let namePart = "";
  if (raw.includes("|")) {
    namePart = raw.slice(raw.indexOf("|") + 1);
  } else if (/ - /.test(raw)) {
    namePart = raw.slice(raw.indexOf(" - ") + 3);
  } else {
    let rest = normalized;
    for (const term of TRANSFER_PHRASE_TERMS) {
      if (rest.startsWith(term)) {
        rest = rest.slice(term.length);
        break;
      }
    }
    namePart = rest;
  }

  const cleaned = normalizePolicyText(namePart)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned.split(" ").filter((token) => token.length > 1);
  if (tokens.length < 2) return null;
  return tokens.join(" ");
}

type InternalTransferPairInput = {
  id: string;
  direction: DomainTransactionDirection | string;
  amount: Prisma.Decimal;
  occurredAt: Date;
  description?: string | null;
  normalizedDescription?: string | null;
  merchantName?: string | null;
};

// Detecta pares de transferência entre contas próprias: uma saída e uma entrada
// de MESMO valor e MESMO contraparte, ocorridas dentro de uma janela curta.
// Ambas as pernas são devolvidas para serem excluídas de receita/despesa —
// isso resolve as auto-transferências ("Pix enviado Thierry" ↔ "Transferência
// Recebida|THIERRY") que hoje inflam a receita por não terem categoria de
// "mesma titularidade". É deliberadamente conservador: exige valor idêntico ao
// centavo e nome de contraparte igual, então só casa lavagens reais.
export function detectInternalTransferPairIds(
  transactions: InternalTransferPairInput[],
  options?: { windowMs?: number },
): Set<string> {
  const windowMs = options?.windowMs ?? 3 * DAY_MS;
  const paired = new Set<string>();

  type Leg = { id: string; time: number; used: boolean };
  const inflows = new Map<string, Leg[]>();
  const outflows = new Map<string, Leg[]>();

  for (const tx of transactions) {
    if (
      tx.direction !== DomainTransactionDirection.INFLOW &&
      tx.direction !== DomainTransactionDirection.OUTFLOW
    ) {
      continue;
    }
    const name =
      extractTransferCounterparty(tx.description ?? tx.normalizedDescription) ??
      extractTransferCounterparty(tx.merchantName);
    if (!name) continue;
    const cents = decimal(tx.amount).abs().toFixed(2);
    if (cents === "0.00") continue;
    const key = `${name}|${cents}`;
    const leg: Leg = { id: tx.id, time: tx.occurredAt.getTime(), used: false };
    const bucket =
      tx.direction === DomainTransactionDirection.INFLOW ? inflows : outflows;
    const list = bucket.get(key) ?? [];
    list.push(leg);
    bucket.set(key, list);
  }

  for (const [key, outs] of outflows.entries()) {
    const ins = inflows.get(key);
    if (!ins) continue;
    for (const out of outs) {
      if (out.used) continue;
      let best: Leg | null = null;
      let bestDelta = Infinity;
      for (const inLeg of ins) {
        if (inLeg.used) continue;
        const delta = Math.abs(inLeg.time - out.time);
        if (delta <= windowMs && delta < bestDelta) {
          best = inLeg;
          bestDelta = delta;
        }
      }
      if (best) {
        out.used = true;
        best.used = true;
        paired.add(out.id);
        paired.add(best.id);
      }
    }
  }

  return paired;
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

  if (isInvestmentTransfer(categoryName, categoryKind, description)) {
    return "investment";
  }

  if (direction === DomainTransactionDirection.INFLOW) {
    const category = normalizePolicyText(categoryName);
    const desc = normalizePolicyText(description);
    // Pagamento de fatura nunca é renda — nem quando um padrão de salário
    // genérico ("Pagamento recebido") casa a descrição. Este check vem antes
    // da precedência de salário de propósito.
    if (NON_INCOME_CATEGORY_TERMS.some((term) => category.includes(term) || desc.includes(term))) {
      return "excluded";
    }
    // Entradas marcadas como salário têm precedência sobre a exclusão de
    // transferência: salário costuma chegar como "Transferência Recebida"
    // com categoria "mesma titularidade" e seria descartado.
    if (
      options?.salaryPatterns?.length &&
      matchesSalaryPatternValues(
        [description, options.merchantName],
        options.salaryPatterns,
      )
    ) {
      return "income";
    }
    if (isInternalAccountTransfer(categoryName)) return "excluded";
    return "income";
  }

  if (direction === DomainTransactionDirection.OUTFLOW) {
    // Pagamento de fatura (ex.: "Pagamento de fatura" saindo da conta para o
    // cartão) nunca é despesa — as compras do cartão já contam individualmente.
    const desc = normalizePolicyText(description);
    if (CARD_PAYMENT_OUTFLOW_TERMS.some((term) => desc.includes(term))) {
      return "excluded";
    }
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

// Faturas com saldo absoluto abaixo deste limiar são resíduo de reconciliação
// da Pluggy (ex.: 0.0039, -0.0029) e nunca devem virar OVERDUE/OPEN.
export const BILL_NOISE_THRESHOLD = 0.01;

export function normalizeBillStatus(
  status: string | null | undefined,
  dueDate: Date | null | undefined,
  totalAmount?: DecimalLike,
  now = new Date(),
) {
  const normalized = status?.trim().toUpperCase();
  const total = decimal(totalAmount);

  if (normalized === "PAID" || normalized === "SETTLED") return "PAID";
  // Resíduo microscópico (positivo ou negativo) conta como fatura fechada.
  if (total.abs().lessThan(BILL_NOISE_THRESHOLD)) return "CLOSED";
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
