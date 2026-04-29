import { DomainAccountKind, Prisma, SourceProvider } from "@prisma/client";

import { projectPluggyReadModels } from "@/lib/domain/projectors";
import { getApiKey } from "@/lib/integrations/pluggy";
import { prisma } from "@/lib/prisma";

const ENRICHMENT_BASE = "https://enrichment-api.pluggy.ai";
const MAX_BATCH_SIZE = 5000;

type CategorizeTransaction = {
  id: string;
  amount: number;
  date: string;
  description: string;
  paymentData?: unknown;
  creditCardMetadata?: {
    payeeMCC?: string | number | null;
  };
};

type CategorizeResult = {
  id: string;
  category?: string | null;
  categoryId?: string | null;
  merchant?: {
    name?: string | null;
    businessName?: string | null;
    cnpj?: string | null;
  } | null;
};

function getBaseUrl() {
  return process.env.PLUGGY_ENRICHMENT_API_BASE ?? ENRICHMENT_BASE;
}

function getHeaderName() {
  return process.env.PLUGGY_API_KEY_HEADER ?? "X-API-KEY";
}

function getClientUserId() {
  return process.env.GRAVEL_CLIENT_USER_ID ?? "local";
}

function mapAccountType(kind?: DomainAccountKind | null) {
  if (kind === DomainAccountKind.CARD) return "CREDIT_CARD";
  if (kind === DomainAccountKind.BANK || kind === DomainAccountKind.CASH)
    return "CHECKING";
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

export function extractPluggyEnrichmentFields(payload: unknown) {
  const raw = asObject(payload);
  if (!raw) {
    return {
      paymentData: undefined,
      creditCardMetadata: undefined,
      isBusiness: undefined,
    };
  }

  const creditCardMetadata = asObject(raw.creditCardMetadata);
  const payeeMCC = firstDefined(
    creditCardMetadata?.payeeMCC,
    creditCardMetadata?.mcc,
    raw.payeeMCC,
    raw.mcc,
  ) as string | number | null | undefined;

  return {
    paymentData: raw.paymentData,
    creditCardMetadata:
      payeeMCC !== undefined
        ? {
            payeeMCC,
          }
        : undefined,
    isBusiness:
      typeof raw.isBusiness === "boolean" ? raw.isBusiness : undefined,
  };
}

export async function categorizePluggyTransactions(input: {
  transactions: CategorizeTransaction[];
  accountType?: "CHECKING" | "CREDIT_CARD";
  isBusiness?: boolean;
}) {
  if (input.transactions.length === 0) return [];
  if (input.transactions.length > MAX_BATCH_SIZE) {
    throw new Error(
      `Pluggy enrichment aceita no maximo ${MAX_BATCH_SIZE} transacoes por request`,
    );
  }

  const apiKey = await getApiKey();
  const response = await fetch(`${getBaseUrl()}/categorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [getHeaderName()]: apiKey,
    },
    body: JSON.stringify({
      transactions: input.transactions,
      clientUserId: getClientUserId(),
      accountType: input.accountType,
      ...(input.isBusiness !== undefined
        ? { isBusiness: input.isBusiness }
        : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Pluggy enrichment error: ${response.status} ${text}`.trim(),
    );
  }

  const payload = (await response.json()) as { results?: CategorizeResult[] };
  return payload.results ?? [];
}

export async function runPluggyTransactionEnrichment(options?: {
  limit?: number;
  reproject?: boolean;
}) {
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), MAX_BATCH_SIZE);
  const now = new Date();
  const successStaleBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const errorRetryBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentlyProcessedIds = (
    await prisma.transactionEnrichment.findMany({
      where: {
        OR: [
          {
            status: { in: ["SUCCESS", "UNMATCHED"] },
            lastEnrichedAt: { gte: successStaleBefore },
          },
          {
            status: "ERROR",
            lastEnrichedAt: { gte: errorRetryBefore },
          },
        ],
      },
      select: { domainTransactionId: true },
    })
  ).map((item) => item.domainTransactionId);

  const transactions = await prisma.domainTransaction.findMany({
    where: {
      sourceProvider: SourceProvider.PLUGGY,
      ignored: false,
      description: { not: null },
      id:
        recentlyProcessedIds.length > 0
          ? { notIn: recentlyProcessedIds }
          : undefined,
    },
    include: {
      domainAccount: { select: { kind: true } },
    },
    orderBy: [{ occurredAt: "desc" }],
    take: limit,
  });

  if (transactions.length === 0) {
    return { scanned: 0, enriched: 0, failed: 0, reprojected: false };
  }

  const snapshots = await prisma.pluggyPayloadSnapshot.findMany({
    where: {
      resourceType: "transaction",
      externalId: {
        in: transactions.map((transaction) => transaction.sourceExternalId),
      },
    },
    orderBy: [{ fetchedAt: "desc" }],
  });
  const rawPayloadByExternalId = new Map<string, unknown>();
  for (const snapshot of snapshots) {
    if (rawPayloadByExternalId.has(snapshot.externalId)) continue;
    try {
      rawPayloadByExternalId.set(
        snapshot.externalId,
        JSON.parse(snapshot.payloadJson),
      );
    } catch {}
  }

  const byAccountType = new Map<string, typeof transactions>();
  for (const transaction of transactions) {
    const enrichmentFields = extractPluggyEnrichmentFields(
      rawPayloadByExternalId.get(transaction.sourceExternalId),
    );
    const accountType =
      mapAccountType(transaction.domainAccount?.kind) ?? "UNKNOWN";
    const key = `${accountType}:${enrichmentFields.isBusiness === true ? "BUSINESS" : enrichmentFields.isBusiness === false ? "PERSONAL" : "UNKNOWN"}`;
    byAccountType.set(key, [...(byAccountType.get(key) ?? []), transaction]);
  }

  let enriched = 0;
  let failed = 0;

  for (const [groupKey, group] of byAccountType.entries()) {
    const [accountType, businessScope] = groupKey.split(":");
    const requestItems = group.map((transaction) => {
      const enrichmentFields = extractPluggyEnrichmentFields(
        rawPayloadByExternalId.get(transaction.sourceExternalId),
      );

      return {
        id: transaction.id,
        amount: Number(transaction.amount.toString()),
        date: transaction.occurredAt.toISOString(),
        description:
          transaction.description ?? transaction.normalizedDescription ?? "",
        paymentData: enrichmentFields.paymentData,
        creditCardMetadata: enrichmentFields.creditCardMetadata,
      };
    });

    try {
      const results = await categorizePluggyTransactions({
        transactions: requestItems,
        accountType:
          accountType === "UNKNOWN"
            ? undefined
            : (accountType as "CREDIT_CARD" | "CHECKING"),
        isBusiness:
          businessScope === "BUSINESS"
            ? true
            : businessScope === "PERSONAL"
              ? false
              : undefined,
      });
      const resultMap = new Map(results.map((result) => [result.id, result]));

      await prisma.$transaction(
        group.map((transaction) => {
          const result = resultMap.get(transaction.id);
          return prisma.transactionEnrichment.upsert({
            where: { domainTransactionId: transaction.id },
            update: {
              pluggyCategory: result?.category ?? null,
              pluggyCategoryId: result?.categoryId ?? null,
              merchantName: result?.merchant?.name ?? null,
              merchantBusinessName: result?.merchant?.businessName ?? null,
              merchantCnpj: result?.merchant?.cnpj ?? null,
              status: result ? "SUCCESS" : "UNMATCHED",
              lastEnrichedAt: now,
              payloadJson: result ? JSON.stringify(result) : null,
              errorJson: null,
            },
            create: {
              domainTransactionId: transaction.id,
              pluggyCategory: result?.category ?? null,
              pluggyCategoryId: result?.categoryId ?? null,
              merchantName: result?.merchant?.name ?? null,
              merchantBusinessName: result?.merchant?.businessName ?? null,
              merchantCnpj: result?.merchant?.cnpj ?? null,
              status: result ? "SUCCESS" : "UNMATCHED",
              lastEnrichedAt: now,
              payloadJson: result ? JSON.stringify(result) : null,
            },
          });
        }),
      );
      enriched += results.length;
    } catch (error) {
      failed += group.length;
      const errorJson = JSON.stringify({
        message: error instanceof Error ? error.message : "Erro desconhecido",
        at: now.toISOString(),
      });

      await prisma.$transaction(
        group.map((transaction) =>
          prisma.transactionEnrichment.upsert({
            where: { domainTransactionId: transaction.id },
            update: {
              status: "ERROR",
              lastEnrichedAt: now,
              errorJson,
            },
            create: {
              domainTransactionId: transaction.id,
              status: "ERROR",
              lastEnrichedAt: now,
              errorJson,
            },
          }),
        ),
      );
    }
  }

  const shouldReproject = options?.reproject ?? true;
  if (shouldReproject && enriched > 0) {
    await projectPluggyReadModels();
  }

  return {
    scanned: transactions.length,
    enriched,
    failed,
    reprojected: shouldReproject && enriched > 0,
  };
}

export function resolveEffectiveCategory(input: {
  localCategoryId?: string | null;
  providerCategoryId?: string | null;
  enrichment?: {
    pluggyCategory?: string | null;
    pluggyCategoryId?: string | null;
  } | null;
  categoriesByName?: Map<string, string>;
}) {
  if (input.localCategoryId) return input.localCategoryId;
  if (input.providerCategoryId) return input.providerCategoryId;
  const enrichedName = input.enrichment?.pluggyCategory?.trim().toLowerCase();
  if (enrichedName && input.categoriesByName?.has(enrichedName)) {
    return input.categoriesByName.get(enrichedName) ?? null;
  }
  return null;
}

export type TransactionEnrichmentSummary =
  Prisma.TransactionEnrichmentGetPayload<Record<string, never>>;
