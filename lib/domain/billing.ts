import { DomainAccountKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Motor central de ciclo de fatura de cartão de crédito.
 *
 * Toda tela que mostra "fatura atual", "próximas faturas" ou "total em aberto"
 * deve consumir este módulo (via /api/domain/cards/statements) para que os
 * valores sejam idênticos em /accounts, /bills e /projection.
 *
 * Regras:
 * - O ciclo é definido pelo dia de fechamento (`billingClosingDay`): a fatura
 *   corrente contém as compras de (fechamento anterior + 1 dia) até o próximo
 *   fechamento, inclusive.
 * - O vencimento (`billingDueDay`) é o primeiro dia >= fechamento com aquele
 *   dia do mês (normalmente no mês seguinte ao fechamento quando o dia de
 *   vencimento é menor que o dia de fechamento).
 * - Ciclos passados são reconciliados com as faturas reais do provedor
 *   (DomainBill) quando existem — o valor oficial do banco vence o cálculo.
 * - Sem `billingClosingDay` configurado não há como separar a fatura atual
 *   das futuras; o payload sinaliza `configured: false` para a UI exibir o
 *   aviso de configuração.
 */

export type StatementStatus = "PAID" | "CLOSED" | "OPEN" | "FUTURE" | "OVERDUE";

export type CardStatement = {
  /** Identificador estável do ciclo: `<accountId>:<yyyy-MM do fechamento>` */
  id: string;
  accountId: string;
  /** Primeiro dia do ciclo (inclusive). */
  periodStart: string;
  /** Dia de fechamento do ciclo (inclusive). */
  periodEnd: string;
  dueDate: string;
  /** Total de compras - estornos do ciclo (>= 0 na prática). */
  amount: number;
  /** Valor oficial do provedor quando reconciliado com DomainBill. */
  providerAmount: number | null;
  minimumPayment: number | null;
  status: StatementStatus;
  transactionCount: number;
  /** true quando o valor veio do DomainBill do banco, não do agrupamento. */
  reconciled: boolean;
  paidAt: string | null;
  /** DomainBill correspondente, quando o ciclo tem fatura real do provedor. */
  providerBillId: string | null;
};

export type CardStatementsPayload = {
  accountId: string;
  accountName: string;
  institutionName: string | null;
  configured: boolean;
  closingDay: number | null;
  dueDay: number | null;
  /** Sugestão de dia de vencimento inferida do histórico de faturas do banco. */
  suggestedDueDay: number | null;
  /** Saldo devedor total informado pelo provedor (todas as faturas em aberto). */
  totalOpen: number;
  current: CardStatement | null;
  upcoming: CardStatement[];
  past: CardStatement[];
};

const PAYMENT_DESCRIPTION_PATTERN =
  /pagamento\s*(recebido|de\s*fatura|on\s*-?\s*line|efetuado)|pagto\.?\s*(de)?\s*fatura/i;

const NOISE_THRESHOLD = 0.01;

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function clampDayToMonth(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

function utcDate(year: number, monthIndex: number, day: number) {
  return new Date(
    Date.UTC(year, monthIndex, clampDayToMonth(year, monthIndex, day), 12, 0, 0),
  );
}

/**
 * Fechamento do ciclo cujo período contém `reference`.
 * O ciclo que fecha em `closingDay` deste mês cobre (closingDay anterior, closingDay].
 */
export function closingDateForReference(closingDay: number, reference: Date) {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const closingThisMonth = utcDate(year, month, closingDay);
  if (reference.getTime() <= closingThisMonth.getTime()) {
    return closingThisMonth;
  }
  return utcDate(year, month + 1, closingDay);
}

export function statementPeriod(closingDay: number, closingDate: Date) {
  const previousClosing = utcDate(
    closingDate.getUTCFullYear(),
    closingDate.getUTCMonth() - 1,
    closingDay,
  );
  const periodStart = new Date(previousClosing.getTime() + 24 * 60 * 60 * 1000);
  return { start: periodStart, end: closingDate };
}

export function dueDateForClosing(
  closingDate: Date,
  dueDay: number | null,
): Date {
  const fallbackDueDay = closingDate.getUTCDate();
  const day = dueDay ?? fallbackDueDay;
  const sameMonth = utcDate(
    closingDate.getUTCFullYear(),
    closingDate.getUTCMonth(),
    day,
  );
  if (sameMonth.getTime() > closingDate.getTime()) return sameMonth;
  return utcDate(closingDate.getUTCFullYear(), closingDate.getUTCMonth() + 1, day);
}

export function isCardPaymentTransaction(input: {
  direction: string;
  description?: string | null;
  categoryName?: string | null;
}) {
  if (input.direction !== "INFLOW") return false;
  const text = `${input.description ?? ""} ${input.categoryName ?? ""}`;
  return PAYMENT_DESCRIPTION_PATTERN.test(text);
}

type StatementTransaction = {
  id: string;
  occurredAt: Date;
  amount: Prisma.Decimal;
  direction: string;
  description: string | null;
  categoryName?: string | null;
};

type ProviderBill = {
  id: string;
  dueDate: Date | null;
  totalAmount: Prisma.Decimal | null;
  minimumPaymentAmount: Prisma.Decimal | null;
  status: string | null;
  metadataJson: string | null;
};

function parsePaidAt(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    const metadata = JSON.parse(metadataJson) as {
      manualPayment?: { paidAt?: string | null };
    };
    return metadata.manualPayment?.paidAt ?? null;
  } catch {
    return null;
  }
}

/** Dia do mês mais frequente entre os vencimentos históricos do provedor. */
export function inferDueDayFromBills(bills: Array<{ dueDate: Date | null }>) {
  const counts = new Map<number, number>();
  for (const bill of bills) {
    if (!bill.dueDate) continue;
    const day = bill.dueDate.getUTCDate();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [day, count] of counts.entries()) {
    if (count > bestCount) {
      best = day;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

export function buildCardStatements(options: {
  accountId: string;
  closingDay: number;
  dueDay: number | null;
  transactions: StatementTransaction[];
  providerBills: ProviderBill[];
  now?: Date;
}): { current: CardStatement | null; upcoming: CardStatement[]; past: CardStatement[] } {
  const now = options.now ?? new Date();
  const { closingDay, dueDay } = options;

  type Bucket = {
    closing: Date;
    purchases: number;
    refunds: number;
    count: number;
  };
  const buckets = new Map<string, Bucket>();

  // Pagamentos de fatura (INFLOW no cartão). Alguns provedores duplicam o
  // registro ("Pagamento recebido" + "pagamento de fatura"), então deduplica
  // por dia+valor antes de usar para detecção de quitação.
  const paymentByDayAmount = new Map<string, { date: Date; amount: number }>();

  for (const tx of options.transactions) {
    if (
      isCardPaymentTransaction({
        direction: tx.direction,
        description: tx.description,
        categoryName: tx.categoryName,
      })
    ) {
      const amount = Math.abs(toNumber(tx.amount));
      if (amount >= NOISE_THRESHOLD) {
        const key = `${tx.occurredAt.toISOString().slice(0, 10)}:${amount.toFixed(2)}`;
        paymentByDayAmount.set(key, { date: tx.occurredAt, amount });
      }
      continue;
    }
    const closing = closingDateForReference(closingDay, tx.occurredAt);
    const key = closing.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? {
      closing,
      purchases: 0,
      refunds: 0,
      count: 0,
    };
    const value = Math.abs(toNumber(tx.amount));
    if (tx.direction === "OUTFLOW") bucket.purchases += value;
    else bucket.refunds += value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  // Garante que o ciclo corrente exista mesmo sem compras ainda.
  const currentClosing = closingDateForReference(closingDay, now);
  const currentKey = currentClosing.toISOString().slice(0, 10);
  if (!buckets.has(currentKey)) {
    buckets.set(currentKey, {
      closing: currentClosing,
      purchases: 0,
      refunds: 0,
      count: 0,
    });
  }

  // Indexa faturas do provedor pelo ciclo a que pertencem (via vencimento).
  const providerByCycle = new Map<string, ProviderBill>();
  for (const bill of options.providerBills) {
    if (!bill.dueDate) continue;
    // O vencimento pertence ao ciclo que fechou imediatamente antes dele.
    const cycleClosing =
      dueDay !== null && closingDay !== null
        ? (() => {
            const candidate = utcDate(
              bill.dueDate.getUTCFullYear(),
              bill.dueDate.getUTCMonth(),
              closingDay,
            );
            return candidate.getTime() < bill.dueDate.getTime()
              ? candidate
              : utcDate(
                  bill.dueDate.getUTCFullYear(),
                  bill.dueDate.getUTCMonth() - 1,
                  closingDay,
                );
          })()
        : null;
    if (!cycleClosing) continue;
    const key = cycleClosing.toISOString().slice(0, 10);
    const existing = providerByCycle.get(key);
    // Prefere a fatura com valor significativo mais recente.
    if (
      !existing ||
      Math.abs(toNumber(bill.totalAmount)) >
        Math.abs(toNumber(existing.totalAmount))
    ) {
      providerByCycle.set(key, bill);
    }
  }

  // Cada pagamento é atribuído ao ciclo com vencimento mais próximo da data
  // do pagamento (usuários costumam pagar dias antes ou depois do vencimento).
  const sortedClosings = [...buckets.values()]
    .map((bucket) => bucket.closing)
    .sort((left, right) => left.getTime() - right.getTime());
  const paymentsByCycle = new Map<string, number>();
  for (const payment of paymentByDayAmount.values()) {
    let bestKey: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const closing of sortedClosings) {
      const due = dueDateForClosing(closing, dueDay);
      const distance = Math.abs(due.getTime() - payment.date.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = closing.toISOString().slice(0, 10);
      }
    }
    if (bestKey && bestDistance <= 45 * 24 * 60 * 60 * 1000) {
      paymentsByCycle.set(
        bestKey,
        (paymentsByCycle.get(bestKey) ?? 0) + payment.amount,
      );
    }
  }

  const SETTLED_AGE_DAYS = 60;

  const statements: CardStatement[] = [...buckets.values()]
    .sort((left, right) => left.closing.getTime() - right.closing.getTime())
    .map((bucket) => {
      const { start, end } = statementPeriod(closingDay, bucket.closing);
      const due = dueDateForClosing(bucket.closing, dueDay);
      const key = bucket.closing.toISOString().slice(0, 10);
      const provider = providerByCycle.get(key) ?? null;
      const computedAmount = Math.max(bucket.purchases - bucket.refunds, 0);
      const providerAmount = provider ? toNumber(provider.totalAmount) : null;
      const reconciled =
        provider !== null &&
        providerAmount !== null &&
        Math.abs(providerAmount) >= NOISE_THRESHOLD;
      const amount = reconciled ? Math.abs(providerAmount) : computedAmount;
      const paidAt = provider ? parsePaidAt(provider.metadataJson) : null;

      let status: StatementStatus;
      const isClosed = end.getTime() < now.getTime();
      const isCurrent =
        start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
      // Alguns bancos (via Pluggy) reportam `totalAmount` como saldo restante
      // da fatura: após o pagamento sobra um resíduo ~0. Ciclo fechado com
      // fatura do provedor zerada significa fatura quitada.
      const settledByProvider =
        provider !== null &&
        providerAmount !== null &&
        Math.abs(providerAmount) < NOISE_THRESHOLD;
      // Quitação detectada por pagamento: soma dos pagamentos atribuídos ao
      // ciclo cobre >= 80% do valor da fatura.
      const paymentsForCycle = paymentsByCycle.get(key) ?? 0;
      const settledByPayment =
        amount >= NOISE_THRESHOLD && paymentsForCycle >= amount * 0.8;
      // Ciclos antigos sem evidência em nenhuma direção: assume quitado para
      // não acusar dívida vencida de meses atrás sem sinal do provedor.
      const isStale =
        now.getTime() - due.getTime() > SETTLED_AGE_DAYS * 24 * 60 * 60 * 1000;
      if (paidAt || provider?.status === "PAID") {
        status = "PAID";
      } else if (isClosed) {
        status =
          amount < NOISE_THRESHOLD ||
          settledByProvider ||
          settledByPayment ||
          isStale
            ? "PAID"
            : due.getTime() < now.getTime()
              ? "OVERDUE"
              : "CLOSED";
      } else if (isCurrent) {
        status = "OPEN";
      } else {
        status = "FUTURE";
      }

      return {
        id: `${options.accountId}:${key}`,
        accountId: options.accountId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        dueDate: due.toISOString(),
        amount: Math.round(amount * 100) / 100,
        providerAmount:
          providerAmount !== null
            ? Math.round(Math.abs(providerAmount) * 100) / 100
            : null,
        minimumPayment: provider
          ? Math.abs(toNumber(provider.minimumPaymentAmount))
          : null,
        status,
        transactionCount: bucket.count,
        reconciled,
        paidAt,
        providerBillId: provider?.id ?? null,
      } satisfies CardStatement;
    });

  const current =
    statements.find((statement) => statement.status === "OPEN") ?? null;
  const upcoming = statements.filter(
    (statement) => statement.status === "FUTURE",
  );
  const past = statements
    .filter(
      (statement) => statement.status !== "OPEN" && statement.status !== "FUTURE",
    )
    .reverse();

  return { current, upcoming, past };
}

/**
 * Carrega e calcula as faturas de todos os cartões (ou de um cartão específico).
 */
export async function getCardStatements(options?: {
  accountId?: string;
  now?: Date;
}): Promise<CardStatementsPayload[]> {
  const now = options?.now ?? new Date();
  const cards = await prisma.domainAccount.findMany({
    where: {
      kind: DomainAccountKind.CARD,
      id: options?.accountId,
    },
    orderBy: [{ name: "asc" }],
  });
  if (cards.length === 0) return [];

  const cardIds = cards.map((card) => card.id);
  const [transactions, bills, categories] = await Promise.all([
    prisma.domainTransaction.findMany({
      where: { domainAccountId: { in: cardIds }, ignored: false },
      select: {
        id: true,
        occurredAt: true,
        amount: true,
        direction: true,
        description: true,
        domainCategoryId: true,
        domainAccountId: true,
      },
      orderBy: [{ occurredAt: "asc" }],
    }),
    prisma.domainBill.findMany({
      where: { domainAccountId: { in: cardIds } },
      orderBy: [{ dueDate: "asc" }],
    }),
    prisma.domainCategory.findMany({ select: { id: true, name: true } }),
  ]);

  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  );

  return cards.map((card) => {
    const cardTransactions = transactions
      .filter((tx) => tx.domainAccountId === card.id)
      .map((tx) => ({
        id: tx.id,
        occurredAt: tx.occurredAt,
        amount: tx.amount,
        direction: tx.direction as string,
        description: tx.description,
        categoryName: tx.domainCategoryId
          ? (categoryNameById.get(tx.domainCategoryId) ?? null)
          : null,
      }));
    const cardBills = bills.filter(
      (bill) => bill.domainAccountId === card.id,
    );
    const suggestedDueDay = inferDueDayFromBills(cardBills);
    const closingDay = card.billingClosingDay ?? null;
    const dueDay = card.billingDueDay ?? suggestedDueDay;
    const totalOpen = Math.abs(toNumber(card.balance));

    if (!closingDay) {
      return {
        accountId: card.id,
        accountName: card.nickname ?? card.name,
        institutionName: card.institutionName,
        configured: false,
        closingDay: null,
        dueDay,
        suggestedDueDay,
        totalOpen,
        current: null,
        upcoming: [],
        past: [],
      } satisfies CardStatementsPayload;
    }

    const { current, upcoming, past } = buildCardStatements({
      accountId: card.id,
      closingDay,
      dueDay,
      transactions: cardTransactions,
      providerBills: cardBills,
      now,
    });

    return {
      accountId: card.id,
      accountName: card.nickname ?? card.name,
      institutionName: card.institutionName,
      configured: true,
      closingDay,
      dueDay,
      suggestedDueDay,
      totalOpen,
      current,
      upcoming,
      past,
    } satisfies CardStatementsPayload;
  });
}

export type CardStatementsSummaryMetrics = {
  counts: { overdue: number; open: number; paid: number; future: number };
  overdueAmount: number;
  openAmount: number;
  dueIn7DaysAmount: number;
  statements: CardStatementsPayload[];
};

/**
 * Agrega os dados do motor de ciclo de fatura em métricas consolidadas.
 * Substitui getBillsSummaryMetrics() no CLI e MCP para garantir que os
 * números sejam idênticos aos exibidos na UI /bills.
 */
export async function getCardStatementsSummaryMetrics(options?: {
  accountId?: string;
  now?: Date;
}): Promise<CardStatementsSummaryMetrics> {
  const now = options?.now ?? new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const statements = await getCardStatements(options);

  let overdueCount = 0;
  let openCount = 0;
  let paidCount = 0;
  let futureCount = 0;
  let overdueAmount = 0;
  let openAmount = 0;
  let dueIn7DaysAmount = 0;

  for (const card of statements) {
    const all = [
      ...(card.current ? [card.current] : []),
      ...card.upcoming,
      ...card.past,
    ];
    for (const s of all) {
      const due = new Date(s.dueDate);
      const amount = s.amount;
      switch (s.status) {
        case "OVERDUE":
          overdueCount++;
          overdueAmount += amount;
          break;
        case "OPEN":
          openCount++;
          openAmount += amount;
          if (due <= in7Days) dueIn7DaysAmount += amount;
          break;
        case "PAID":
        case "CLOSED":
          paidCount++;
          break;
        case "FUTURE":
          futureCount++;
          if (due <= in7Days) dueIn7DaysAmount += amount;
          break;
      }
    }
  }

  return {
    counts: { overdue: overdueCount, open: openCount, paid: paidCount, future: futureCount },
    overdueAmount,
    openAmount,
    dueIn7DaysAmount,
    statements,
  };
}
