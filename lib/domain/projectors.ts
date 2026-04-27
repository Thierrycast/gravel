import { randomUUID } from "node:crypto";

import {
  DomainAccountKind,
  DomainCategoryKind,
  DomainTransactionDirection,
  OpsRunStatus,
  Prisma,
  RuleMatchType,
  SourceProvider,
  CategoryRule,
} from "@prisma/client";

import { markDomainSyncState } from "@/lib/admin/ops";
import { computeCryptoPositionStates } from "@/lib/domain/crypto-math";
import {
  detectExplicitInstallment,
  rebuildInstallmentGroups,
} from "@/lib/domain/installments";
import { prisma } from "@/lib/prisma";

function normalizeText(value?: string | null) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() ?? null
  );
}

function evaluateRule(
  matchType: RuleMatchType,
  ruleValue: string,
  candidate?: string | null,
) {
  if (!candidate) return false;

  switch (matchType) {
    case RuleMatchType.EXACT:
      return candidate === ruleValue;
    case RuleMatchType.CONTAINS:
      return candidate.includes(ruleValue);
    case RuleMatchType.PREFIX:
      return candidate.startsWith(ruleValue);
    case RuleMatchType.REGEX:
      try {
        return new RegExp(ruleValue, "i").test(candidate);
      } catch {
        return false;
      }
  }
}

/**
 * Normalize the sign/direction of a Pluggy transaction amount based on account type.
 *
 * For credit card accounts (type="CREDIT"), the Pluggy API sends amounts with
 * inverted semantics: positive amount + type="CREDIT" = a purchase (expense for the user),
 * not income. We negate the amount so that the standard `amount >= 0 → INFLOW` logic works.
 */
function normalizePluggyTransactionAmount(
  rawAmount: Prisma.Decimal,
  accountType: string | null | undefined,
): Prisma.Decimal {
  // Credit card accounts: Pluggy CREDIT type means purchase (bank credits the card bill).
  // Positive amounts are charges (expenses) → negate so they become OUTFLOW.
  // Negative amounts are payments/refunds → negate so they become INFLOW.
  if (accountType === "CREDIT") {
    return rawAmount.negated();
  }
  return rawAmount;
}

function mapPluggyAccountKind(type?: string | null): DomainAccountKind {
  switch (type) {
    case "BANK":
      return DomainAccountKind.BANK;
    case "CASH":
      return DomainAccountKind.CASH;
    case "CREDIT":
    case "CARD":
      return DomainAccountKind.CARD;
    case "INVESTMENT":
      return DomainAccountKind.INVESTMENT;
    case "CRYPTO":
      return DomainAccountKind.CRYPTO;
    default:
      return DomainAccountKind.OTHER;
  }
}

function mapCategoryKind(sourceName?: string | null) {
  const normalized = normalizeText(sourceName);
  if (!normalized) return DomainCategoryKind.OTHER;
  if (
    normalized.includes("income") ||
    normalized.includes("renda") ||
    normalized.includes("salary")
  ) {
    return DomainCategoryKind.INCOME;
  }
  if (
    normalized.includes("transfer") ||
    normalized.includes("pix") ||
    normalized.includes("ted")
  ) {
    return DomainCategoryKind.TRANSFER;
  }
  return DomainCategoryKind.EXPENSE;
}

async function ensureDefaultCategories() {
  const defaults = [
    {
      slug: "uncategorized-income",
      name: "Sem categoria de entrada",
      kind: DomainCategoryKind.INCOME,
    },
    {
      slug: "uncategorized-expense",
      name: "Sem categoria de saida",
      kind: DomainCategoryKind.EXPENSE,
    },
    {
      slug: "uncategorized-transfer",
      name: "Sem categoria de transferencia",
      kind: DomainCategoryKind.TRANSFER,
    },
  ];

  await prisma.$transaction(
    defaults.map((category) =>
      prisma.domainCategory.upsert({
        where: { slug: category.slug },
        update: {
          name: category.name,
          kind: category.kind,
        },
        create: category,
      }),
    ),
  );
}

async function ensureMerchant(
  input: {
    displayName: string;
    cnpj?: string | null;
    sourceExternalId?: string | null;
    sourceProvider: SourceProvider;
  },
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? prisma;
  const normalizedName = normalizeText(input.displayName) ?? "merchant";

  const existingBySource =
    input.sourceExternalId &&
    (await client.domainMerchantSource.findUnique({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: input.sourceProvider,
          sourceExternalId: input.sourceExternalId,
        },
      },
    }));

  if (existingBySource) {
    return client.domainMerchant.findUnique({
      where: { id: existingBySource.domainMerchantId },
    });
  }

  let merchant =
    (input.cnpj
      ? await client.domainMerchant.findUnique({
          where: { cnpj: input.cnpj },
        })
      : null) ??
    (await client.domainMerchant.findUnique({
      where: { normalizedName },
    }));

  if (!merchant) {
    merchant = await client.domainMerchant.create({
      data: {
        displayName: input.displayName,
        normalizedName,
        cnpj: input.cnpj ?? undefined,
      },
    });
  } else if (merchant.displayName !== input.displayName && !merchant.cnpj) {
    merchant = await client.domainMerchant.update({
      where: { id: merchant.id },
      data: {
        displayName: merchant.displayName || input.displayName,
      },
    });
  }

  if (input.sourceExternalId) {
    await client.domainMerchantSource.upsert({
      where: {
        sourceProvider_sourceExternalId: {
          sourceProvider: input.sourceProvider,
          sourceExternalId: input.sourceExternalId,
        },
      },
      update: {
        domainMerchantId: merchant.id,
        sourceName: input.displayName,
        sourceCnpj: input.cnpj ?? undefined,
      },
      create: {
        domainMerchantId: merchant.id,
        sourceProvider: input.sourceProvider,
        sourceExternalId: input.sourceExternalId,
        sourceName: input.displayName,
        sourceCnpj: input.cnpj ?? undefined,
      },
    });
  }

  return merchant;
}

async function resolveCategoryId(
  input: {
    sourceProvider: SourceProvider;
    providerCategoryId?: string | null;
    merchantName?: string | null;
    merchantCnpj?: string | null;
    description?: string | null;
    amount?: Prisma.Decimal | null;
  },
  context?: {
    rules?: CategoryRule[];
    categoriesBySource?: Map<string, string>;
    categoriesBySlug?: Map<string, string>;
  },
) {
  const rules =
    context?.rules ??
    (await prisma.categoryRule.findMany({
      where: {
        active: true,
        OR: [{ provider: input.sourceProvider }, { provider: null }],
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    }));

  const candidates: Record<string, string | null> = {
    providerCategoryId: input.providerCategoryId ?? null,
    merchantCnpj: input.merchantCnpj ?? null,
    merchantName: normalizeText(input.merchantName),
    description: normalizeText(input.description),
  };

  for (const rule of rules) {
    const candidate = candidates[rule.matchField];
    if (!evaluateRule(rule.matchType, rule.matchValue, candidate)) continue;
    if (rule.domainCategoryId) return rule.domainCategoryId;
  }

  if (input.providerCategoryId) {
    const cachedId = context?.categoriesBySource?.get(
      `${input.sourceProvider}:${input.providerCategoryId}`,
    );
    if (cachedId) return cachedId;

    if (!context?.categoriesBySource) {
      const providerCategory = await prisma.domainCategory.findFirst({
        where: {
          sourceProvider: input.sourceProvider,
          sourceExternalId: input.providerCategoryId,
        },
      });
      if (providerCategory) return providerCategory.id;
    }
  }

  const fallbackSlug =
    input.amount && input.amount.greaterThanOrEqualTo(0)
      ? "uncategorized-income"
      : "uncategorized-expense";

  const cachedFallbackId = context?.categoriesBySlug?.get(fallbackSlug);
  if (cachedFallbackId) return cachedFallbackId;

  if (!context?.categoriesBySlug) {
    const fallback = await prisma.domainCategory.findUnique({
      where: { slug: fallbackSlug },
    });
    return fallback?.id ?? null;
  }

  return null;
}

async function projectPluggyCategories() {
  const records = await prisma.pluggyCategoryRecord.findMany();
  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const slug = `pluggy-${record.externalId}`;
      await tx.domainCategory.upsert({
        where: { slug },
        update: {
          name:
            record.descriptionTranslated ??
            record.description ??
            `Categoria ${record.externalId}`,
          kind: mapCategoryKind(
            record.descriptionTranslated ?? record.description,
          ),
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
        create: {
          slug,
          name:
            record.descriptionTranslated ??
            record.description ??
            `Categoria ${record.externalId}`,
          kind: mapCategoryKind(
            record.descriptionTranslated ?? record.description,
          ),
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      });
      projected += 1;
    }

    const categories = await tx.domainCategory.findMany({
      where: { sourceProvider: SourceProvider.PLUGGY },
      select: { id: true, sourceExternalId: true },
    });
    const categoryBySourceId = new Map(
      categories
        .filter((category) => category.sourceExternalId)
        .map((category) => [category.sourceExternalId as string, category.id]),
    );

    for (const record of records) {
      if (!record.parentId) continue;
      const id = categoryBySourceId.get(record.externalId);
      const parentId = categoryBySourceId.get(record.parentId);
      if (!id || !parentId || id === parentId) continue;
      await tx.domainCategory.update({
        where: { id },
        data: { parentId },
      });
    }
  });

  await markDomainSyncState({
    stateKey: "domain:pluggy:categories",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

async function projectPluggyAccounts() {
  const records = await prisma.pluggyAccountRecord.findMany();
  const items = await prisma.pluggyItem.findMany();
  const itemMap = new Map(items.map((i) => [i.pluggyItemId, i.imageUrl]));
  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const imageUrl = itemMap.get(record.itemExternalId);
      const domainAccount = await tx.domainAccount.upsert({
        where: {
          sourceProvider_sourceExternalId: {
            sourceProvider: SourceProvider.PLUGGY,
            sourceExternalId: record.externalId,
          },
        },
        update: {
          name: record.name ?? record.externalId,
          normalizedName: normalizeText(record.name) ?? undefined,
          kind: mapPluggyAccountKind(record.type),
          currencyCode: record.currencyCode ?? "BRL",
          balance: record.balance ?? undefined,
          sourceParentId: record.itemExternalId,
          ownerName: record.owner ?? undefined,
          institutionName: "Pluggy",
          imageUrl: imageUrl ?? undefined,
          metadataJson: JSON.stringify({
            subtype: record.subtype,
            number: record.number,
            taxNumber: record.taxNumber,
          }),
        },
        create: {
          name: record.name ?? record.externalId,
          normalizedName: normalizeText(record.name) ?? undefined,
          kind: mapPluggyAccountKind(record.type),
          currencyCode: record.currencyCode ?? "BRL",
          balance: record.balance ?? undefined,
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.itemExternalId,
          ownerName: record.owner ?? undefined,
          institutionName: "Pluggy",
          imageUrl: imageUrl ?? undefined,
          metadataJson: JSON.stringify({
            subtype: record.subtype,
            number: record.number,
            taxNumber: record.taxNumber,
          }),
        },
      });

      await tx.domainAccountSource.upsert({
        where: {
          sourceProvider_sourceExternalId: {
            sourceProvider: SourceProvider.PLUGGY,
            sourceExternalId: record.externalId,
          },
        },
        update: {
          domainAccountId: domainAccount.id,
          sourceParentId: record.itemExternalId,
        },
        create: {
          domainAccountId: domainAccount.id,
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.itemExternalId,
        },
      });

      projected += 1;
    }
  });

  await markDomainSyncState({
    stateKey: "domain:pluggy:accounts",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

async function projectPluggyMerchants() {
  const records = await prisma.pluggyMerchantRecord.findMany();
  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      await ensureMerchant(
        {
          displayName: record.businessName ?? record.name ?? record.cnpj,
          cnpj: record.cnpj,
          sourceExternalId: record.externalId ?? record.cnpj,
          sourceProvider: SourceProvider.PLUGGY,
        },
        tx,
      );
      projected += 1;
    }
  });

  await markDomainSyncState({
    stateKey: "domain:pluggy:merchants",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

type MerchantLike = {
  id: string;
  displayName: string;
  normalizedName: string;
  cnpj: string | null;
};

/**
 * Resolve the target merchant for a record purely against in-memory maps,
 * registering new merchants / merchant-sources in the provided "pending"
 * arrays so the caller can bulk-insert them in a single round-trip.
 */
function resolveMerchantInMemory(
  input: {
    sourceProvider: SourceProvider;
    merchantName?: string | null;
    merchantCnpj?: string | null;
  },
  ctx: {
    rules: {
      matchType: RuleMatchType;
      matchValue: string;
      merchantId: string | null;
      aliasName: string | null;
    }[];
    merchantsById: Map<string, MerchantLike>;
    merchantByCnpj: Map<string, MerchantLike>;
    merchantByNormalized: Map<string, MerchantLike>;
    merchantSourceByExtId: Map<string, { domainMerchantId: string }>;
    pendingMerchants: {
      id: string;
      displayName: string;
      normalizedName: string;
      cnpj?: string | null;
    }[];
    pendingMerchantSources: {
      id: string;
      domainMerchantId: string;
      sourceProvider: SourceProvider;
      sourceExternalId: string;
      sourceName: string | null;
      sourceCnpj: string | null;
    }[];
  },
): MerchantLike | null {
  const ensure = (input: {
    displayName: string;
    cnpj?: string | null;
    sourceExternalId?: string | null;
    sourceProvider: SourceProvider;
  }): MerchantLike => {
    const normalizedName = normalizeText(input.displayName) ?? "merchant";

    if (input.sourceExternalId) {
      const existingSrc = ctx.merchantSourceByExtId.get(input.sourceExternalId);
      if (existingSrc) {
        const m = ctx.merchantsById.get(existingSrc.domainMerchantId);
        if (m) return m;
      }
    }

    let merchant: MerchantLike | undefined =
      (input.cnpj ? ctx.merchantByCnpj.get(input.cnpj) : undefined) ??
      ctx.merchantByNormalized.get(normalizedName);

    if (!merchant) {
      const newMerchant: MerchantLike = {
        id: randomUUID(),
        displayName: input.displayName,
        normalizedName,
        cnpj: input.cnpj ?? null,
      };
      ctx.pendingMerchants.push({
        id: newMerchant.id,
        displayName: newMerchant.displayName,
        normalizedName: newMerchant.normalizedName,
        cnpj: newMerchant.cnpj ?? undefined,
      });
      ctx.merchantsById.set(newMerchant.id, newMerchant);
      ctx.merchantByNormalized.set(newMerchant.normalizedName, newMerchant);
      if (newMerchant.cnpj)
        ctx.merchantByCnpj.set(newMerchant.cnpj, newMerchant);
      merchant = newMerchant;
    }

    if (
      input.sourceExternalId &&
      !ctx.merchantSourceByExtId.has(input.sourceExternalId)
    ) {
      const sourceRow = {
        id: randomUUID(),
        domainMerchantId: merchant.id,
        sourceProvider: input.sourceProvider,
        sourceExternalId: input.sourceExternalId,
        sourceName: input.displayName,
        sourceCnpj: input.cnpj ?? null,
      };
      ctx.pendingMerchantSources.push(sourceRow);
      ctx.merchantSourceByExtId.set(input.sourceExternalId, {
        domainMerchantId: merchant.id,
      });
    }

    return merchant;
  };

  const merchantName = normalizeText(input.merchantName);
  const merchantCnpj = input.merchantCnpj ?? null;

  for (const rule of ctx.rules) {
    const candidate =
      merchantCnpj && rule.matchValue === merchantCnpj
        ? merchantCnpj
        : merchantName;

    if (!evaluateRule(rule.matchType, rule.matchValue, candidate)) continue;

    if (rule.merchantId) {
      const merchant = ctx.merchantsById.get(rule.merchantId);
      if (merchant) return merchant;
    }

    if (rule.aliasName) {
      return ensure({
        displayName: rule.aliasName,
        cnpj: input.merchantCnpj,
        sourceProvider: input.sourceProvider,
      });
    }
  }

  if (input.merchantName) {
    return ensure({
      displayName: input.merchantName,
      cnpj: input.merchantCnpj,
      sourceProvider: input.sourceProvider,
    });
  }

  return null;
}

async function projectPluggyTransactions() {
  // The check for empty records is done in the while loop
  // maps, so the per-record loop hits zero database round-trips.
  const [
    accounts,
    pluggyAccounts,
    merchantRules,
    categoryRules,
    categories,
    existingMerchants,
    existingMerchantSources,
    ignoredRows,
  ] = await Promise.all([
    prisma.domainAccount.findMany({
      where: { sourceProvider: SourceProvider.PLUGGY },
      select: { id: true, sourceExternalId: true },
    }),
    prisma.pluggyAccountRecord.findMany({
      select: { externalId: true, type: true },
    }),
    prisma.merchantAliasRule.findMany({
      where: {
        active: true,
        OR: [{ provider: SourceProvider.PLUGGY }, { provider: null }],
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.categoryRule.findMany({
      where: {
        active: true,
        OR: [{ provider: SourceProvider.PLUGGY }, { provider: null }],
      },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    }),
    prisma.domainCategory.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        sourceProvider: true,
        sourceExternalId: true,
      },
    }),
    prisma.domainMerchant.findMany({
      select: { id: true, displayName: true, normalizedName: true, cnpj: true },
    }),
    prisma.domainMerchantSource.findMany({
      where: { sourceProvider: SourceProvider.PLUGGY },
      select: { sourceExternalId: true, domainMerchantId: true },
    }),
    prisma.ignoredTransaction.findMany({
      select: { domainTransactionId: true },
    }),
  ]);

  const accountMap = new Map<string, string>(
    accounts
      .filter((a) => a.sourceExternalId !== null)
      .map((a) => [a.sourceExternalId as string, a.id]),
  );
  const accountTypeMap = new Map<string, string | null>(
    pluggyAccounts.map((a) => [a.externalId, a.type]),
  );
  const categoriesBySlug = new Map<string, string>(
    categories.map((c) => [c.slug, c.id]),
  );
  const categoriesBySource = new Map<string, string>(
    categories
      .filter(
        (c) => c.sourceProvider === SourceProvider.PLUGGY && c.sourceExternalId,
      )
      .map((c) => [
        `${c.sourceProvider}:${c.sourceExternalId as string}`,
        c.id,
      ]),
  );
  const categoriesByName = new Map<string, string>(
    categories.map((c) => [
      normalizeText(c.name) ?? c.name.toLowerCase(),
      c.id,
    ]),
  );
  const ignoredIds = new Set(ignoredRows.map((r) => r.domainTransactionId));

  const merchantsById = new Map<string, MerchantLike>(
    existingMerchants.map((m) => [m.id, m]),
  );
  const merchantByCnpj = new Map<string, MerchantLike>(
    existingMerchants
      .filter((m): m is MerchantLike & { cnpj: string } => m.cnpj !== null)
      .map((m) => [m.cnpj, m]),
  );
  const merchantByNormalized = new Map<string, MerchantLike>(
    existingMerchants.map((m) => [m.normalizedName, m]),
  );
  const merchantSourceByExtId = new Map<string, { domainMerchantId: string }>(
    existingMerchantSources.map((s) => [
      s.sourceExternalId,
      { domainMerchantId: s.domainMerchantId },
    ]),
  );

  const pendingMerchants: {
    id: string;
    displayName: string;
    normalizedName: string;
    cnpj?: string | null;
  }[] = [];
  const pendingMerchantSources: {
    id: string;
    domainMerchantId: string;
    sourceProvider: SourceProvider;
    sourceExternalId: string;
    sourceName: string | null;
    sourceCnpj: string | null;
  }[] = [];

  const BATCH_SIZE = 1000;
  let skip = 0;
  let projected = 0;

  while (true) {
    const chunkRecords = await prisma.pluggyTransactionRecord.findMany({
      orderBy: { date: "asc" },
      skip,
      take: BATCH_SIZE,
    });

    if (chunkRecords.length === 0) break;

    const externalIds = chunkRecords.map((r) => r.externalId);
    const [existingTransactions, existingTransactionSources] =
      await Promise.all([
        prisma.domainTransaction.findMany({
          where: {
            sourceProvider: SourceProvider.PLUGGY,
            sourceExternalId: { in: externalIds },
          },
          select: { id: true, sourceExternalId: true, metadataJson: true },
        }),
        prisma.domainTransactionSource.findMany({
          where: {
            sourceProvider: SourceProvider.PLUGGY,
            sourceExternalId: { in: externalIds },
          },
          select: {
            id: true,
            sourceExternalId: true,
            domainTransactionId: true,
          },
        }),
      ]);
    const existingTxIds = existingTransactions.map(
      (transaction) => transaction.id,
    );
    const enrichments =
      existingTxIds.length > 0
        ? await prisma.transactionEnrichment.findMany({
            where: {
              domainTransactionId: { in: existingTxIds },
              status: "SUCCESS",
            },
          })
        : [];
    const enrichmentByTxId = new Map(
      enrichments.map((enrichment) => [
        enrichment.domainTransactionId,
        enrichment,
      ]),
    );

    const existingTxByExtId = new Map<
      string,
      { id: string; metadataJson: string | null }
    >(
      existingTransactions.map((t) => [
        t.sourceExternalId,
        { id: t.id, metadataJson: t.metadataJson },
      ]),
    );
    const existingSourceByExtId = new Map<
      string,
      { id: string; domainTransactionId: string }
    >(
      existingTransactionSources.map((s) => [
        s.sourceExternalId,
        { id: s.id, domainTransactionId: s.domainTransactionId },
      ]),
    );

    type TxCreateData = Prisma.DomainTransactionCreateManyInput;
    type TxUpdateData = Prisma.DomainTransactionUncheckedUpdateInput;
    const creates: TxCreateData[] = [];
    const updates: { id: string; data: TxUpdateData }[] = [];
    const sourceCreates: Prisma.DomainTransactionSourceCreateManyInput[] = [];
    const sourceUpdates: {
      id: string;
      data: Prisma.DomainTransactionSourceUncheckedUpdateInput;
    }[] = [];

    for (const record of chunkRecords) {
      const accountId = record.accountExternalId
        ? accountMap.get(record.accountExternalId)
        : undefined;

      const existingEntry = existingTxByExtId.get(record.externalId);
      const existingMetadata = (() => {
        if (!existingEntry?.metadataJson) return {};
        try {
          return JSON.parse(existingEntry.metadataJson) as {
            overrides?: {
              occurredAt?: string;
              description?: string;
              categoryId?: string | null;
              merchantId?: string | null;
              merchantName?: string | null;
              direction?: DomainTransactionDirection;
            };
          };
        } catch {
          return {};
        }
      })();
      const overrides = existingMetadata.overrides ?? {};
      const enrichment = existingEntry?.id
        ? enrichmentByTxId.get(existingEntry.id)
        : null;
      const effectiveMerchantName =
        overrides.merchantName ??
        record.merchantName ??
        enrichment?.merchantBusinessName ??
        enrichment?.merchantName ??
        null;
      const effectiveMerchantCnpj =
        record.merchantCnpj ?? enrichment?.merchantCnpj ?? null;

      const overrideMerchant = overrides.merchantId
        ? merchantsById.get(overrides.merchantId)
        : undefined;
      const merchant =
        overrideMerchant ??
        resolveMerchantInMemory(
          {
            sourceProvider: SourceProvider.PLUGGY,
            merchantName: effectiveMerchantName,
            merchantCnpj: effectiveMerchantCnpj,
          },
          {
            rules: merchantRules,
            merchantsById,
            merchantByCnpj,
            merchantByNormalized,
            merchantSourceByExtId,
            pendingMerchants,
            pendingMerchantSources,
          },
        );

      const rawAmount = record.amount ?? new Prisma.Decimal(0);
      const pluggyAccountType = accountTypeMap.get(record.accountExternalId);
      const amount = normalizePluggyTransactionAmount(
        rawAmount,
        pluggyAccountType,
      );
      const direction = amount.greaterThanOrEqualTo(0)
        ? DomainTransactionDirection.INFLOW
        : DomainTransactionDirection.OUTFLOW;

      let categoryId = await resolveCategoryId(
        {
          sourceProvider: SourceProvider.PLUGGY,
          providerCategoryId: record.categoryId,
          merchantName: effectiveMerchantName,
          merchantCnpj: effectiveMerchantCnpj,
          description: record.description,
          amount,
        },
        { rules: categoryRules, categoriesBySource, categoriesBySlug },
      );
      if (!record.categoryId && enrichment?.pluggyCategory) {
        categoryId =
          categoriesByName.get(
            normalizeText(enrichment.pluggyCategory) ?? "",
          ) ?? categoryId;
      }
      if ("categoryId" in overrides) {
        categoryId = overrides.categoryId ?? null;
      }

      const metadataPayload = {
        providerCode: record.providerCode,
        providerId: record.providerId,
        status: record.status,
        type: record.type,
        ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
      };
      const metadataJson = JSON.stringify(metadataPayload);
      const description = overrides.description ?? record.description;
      const normalizedDescription =
        normalizeText(description ?? record.descriptionRaw) ?? null;

      const existingTxId = existingEntry?.id;
      let occurredAt = record.date ?? record.createdAt;
      const installment = detectExplicitInstallment(
        record.description ?? record.descriptionRaw,
      );

      if (overrides.occurredAt) {
        occurredAt = new Date(overrides.occurredAt);
      }
      const projectedDirection = overrides.direction ?? direction;

      if (existingTxId) {
        const updateData: TxUpdateData = {
          occurredAt,
          description,
          normalizedDescription,
          amount,
          currencyCode: record.currencyCode ?? "BRL",
          direction: projectedDirection,
          sourceParentId: record.accountExternalId,
          domainAccountId: accountId ?? null,
          domainMerchantId: merchant?.id ?? null,
          installmentNumber: installment?.current ?? null,
          installmentTotal: installment?.total ?? null,
          providerCategoryId: record.categoryId ?? null,
          merchantName: effectiveMerchantName,
          merchantCnpj: effectiveMerchantCnpj,
          metadataJson,
          ignored: ignoredIds.has(existingTxId),
        };
        if (categoryId) updateData.domainCategoryId = categoryId;
        updates.push({ id: existingTxId, data: updateData });
      } else {
        const newId = randomUUID();
        creates.push({
          id: newId,
          occurredAt,
          description,
          normalizedDescription,
          amount,
          currencyCode: record.currencyCode ?? "BRL",
          direction: projectedDirection,
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.accountExternalId,
          domainAccountId: accountId ?? null,
          domainMerchantId: merchant?.id ?? null,
          installmentNumber: installment?.current ?? null,
          installmentTotal: installment?.total ?? null,
          domainCategoryId: categoryId ?? null,
          providerCategoryId: record.categoryId ?? null,
          merchantName: effectiveMerchantName,
          merchantCnpj: effectiveMerchantCnpj,
          ignored: false,
          metadataJson,
        });
        existingTxByExtId.set(record.externalId, {
          id: newId,
          metadataJson: null,
        });
      }

      const txId = existingTxByExtId.get(record.externalId)!.id;
      const existingSource = existingSourceByExtId.get(record.externalId);
      if (existingSource) {
        sourceUpdates.push({
          id: existingSource.id,
          data: {
            domainTransactionId: txId,
            sourceParentId: record.accountExternalId,
          },
        });
      } else {
        sourceCreates.push({
          id: randomUUID(),
          domainTransactionId: txId,
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.accountExternalId,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (pendingMerchants.length > 0) {
        await tx.domainMerchant.createMany({
          data: pendingMerchants.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            normalizedName: m.normalizedName,
            cnpj: m.cnpj ?? undefined,
          })),
        });
      }
      if (pendingMerchantSources.length > 0) {
        await tx.domainMerchantSource.createMany({
          data: pendingMerchantSources.map((s) => ({
            id: s.id,
            domainMerchantId: s.domainMerchantId,
            sourceProvider: s.sourceProvider,
            sourceExternalId: s.sourceExternalId,
            sourceName: s.sourceName ?? undefined,
            sourceCnpj: s.sourceCnpj ?? undefined,
          })),
        });
      }

      if (creates.length > 0) {
        await tx.domainTransaction.createMany({ data: creates });
      }
      for (const { id, data } of updates) {
        await tx.domainTransaction.update({ where: { id }, data });
      }

      if (sourceCreates.length > 0) {
        await tx.domainTransactionSource.createMany({ data: sourceCreates });
      }
      for (const { id, data } of sourceUpdates) {
        await tx.domainTransactionSource.update({ where: { id }, data });
      }

      if (ignoredIds.size > 0) {
        // Ignored updates are handled individually in the loop if existing,
        // but if new ignored transactions were created, they are set to ignored: false above,
        // which matches the existing logic. If we needed to mass update, we could.
      }
    });

    // Reset pending arrays for the next chunk
    pendingMerchants.length = 0;
    pendingMerchantSources.length = 0;

    skip += BATCH_SIZE;
    projected += chunkRecords.length;
  }

  await markDomainSyncState({
    stateKey: "domain:pluggy:transactions",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

function inferBillStatus(
  dueDate: Date | null,
  totalAmount: Prisma.Decimal | null,
): string {
  if (!dueDate) return "OPEN";
  const now = new Date();
  const dueDay = new Date(dueDate);
  const today = new Date(now);
  dueDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const total = totalAmount ? totalAmount.toNumber() : 0;

  // Zero or negative amount bills are considered closed
  if (total <= 0) return "CLOSED";

  // Past due date
  if (dueDay < today) {
    // If due date was more than 30 days ago, likely paid/closed
    const daysPast = Math.floor(
      (today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysPast > 30) return "CLOSED";
    return "OVERDUE";
  }

  return "OPEN";
}

function hasManualBillPayment(metadataJson?: string | null) {
  if (!metadataJson) return false;
  try {
    const metadata = JSON.parse(metadataJson) as {
      manualPayment?: { paidAt?: string | null };
    };
    return Boolean(metadata.manualPayment?.paidAt);
  } catch {
    return false;
  }
}

async function projectPluggyBills() {
  const records = await prisma.pluggyBillRecord.findMany();

  // Pre-fetch accounts
  const accounts = await prisma.domainAccount.findMany({
    where: { sourceProvider: SourceProvider.PLUGGY },
  });
  const accountMap = new Map<string, string>(
    accounts
      .filter((a) => a.sourceExternalId !== null)
      .map((a) => [a.sourceExternalId as string, a.id]),
  );

  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const accountId = record.accountExternalId
        ? accountMap.get(record.accountExternalId)
        : undefined;

      const uniqueWhere = {
        sourceProvider_sourceExternalId: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
        },
      };
      const existingBill = await tx.domainBill.findUnique({
        where: uniqueWhere,
        select: { metadataJson: true },
      });
      const status = hasManualBillPayment(existingBill?.metadataJson)
        ? "PAID"
        : inferBillStatus(record.dueDate, record.totalAmount);

      await tx.domainBill.upsert({
        where: uniqueWhere,
        update: {
          sourceParentId: record.accountExternalId ?? undefined,
          domainAccountId: accountId,
          dueDate: record.dueDate ?? undefined,
          totalAmount: record.totalAmount ?? undefined,
          minimumPaymentAmount: record.minimumPaymentAmount ?? undefined,
          currencyCode: record.totalAmountCurrencyCode ?? undefined,
          allowsInstallments: record.allowsInstallments ?? undefined,
          status,
        },
        create: {
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.accountExternalId ?? undefined,
          domainAccountId: accountId,
          dueDate: record.dueDate ?? undefined,
          totalAmount: record.totalAmount ?? undefined,
          minimumPaymentAmount: record.minimumPaymentAmount ?? undefined,
          currencyCode: record.totalAmountCurrencyCode ?? undefined,
          allowsInstallments: record.allowsInstallments ?? undefined,
          status,
        },
      });

      projected += 1;
    }
  });

  await markDomainSyncState({
    stateKey: "domain:pluggy:bills",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

async function projectPluggyInvestments() {
  const records = await prisma.pluggyInvestmentRecord.findMany();
  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      await tx.domainInvestment.upsert({
        where: {
          sourceProvider_sourceExternalId: {
            sourceProvider: SourceProvider.PLUGGY,
            sourceExternalId: record.externalId,
          },
        },
        update: {
          name: record.name ?? record.externalId,
          type: record.type ?? undefined,
          subtype: record.subtype ?? undefined,
          balance: record.balance ?? undefined,
          currencyCode: record.currencyCode ?? undefined,
          status: record.status ?? undefined,
          sourceParentId: record.itemExternalId,
          metadataJson: JSON.stringify({
            amountOriginal: record.amountOriginal,
            amountProfit: record.amountProfit,
          }),
        },
        create: {
          name: record.name ?? record.externalId,
          type: record.type ?? undefined,
          subtype: record.subtype ?? undefined,
          balance: record.balance ?? undefined,
          currencyCode: record.currencyCode ?? undefined,
          status: record.status ?? undefined,
          sourceProvider: SourceProvider.PLUGGY,
          sourceExternalId: record.externalId,
          sourceParentId: record.itemExternalId,
          metadataJson: JSON.stringify({
            amountOriginal: record.amountOriginal,
            amountProfit: record.amountProfit,
          }),
        },
      });

      projected += 1;
    }
  });

  await markDomainSyncState({
    stateKey: "domain:pluggy:investments",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return projected;
}

export async function projectBinanceReadModels() {
  const latestBalances = await prisma.binanceAssetRecord.findMany({
    orderBy: { asset: "asc" },
  });
  const tradeAggregates = computeCryptoPositionStates(
    await prisma.binanceTradeRecord.findMany({
      select: {
        baseAsset: true,
        quoteAsset: true,
        price: true,
        quantity: true,
        commission: true,
        commissionAsset: true,
        isBuyer: true,
        tradedAt: true,
      },
      orderBy: [{ tradedAt: "asc" }, { tradeId: "asc" }],
    }),
  );

  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const asset of latestBalances) {
      const balance = await tx.binanceAssetBalanceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      });
      if (!balance) continue;

      const price = await tx.binanceAssetPriceSnapshot.findFirst({
        where: { asset: asset.asset },
        orderBy: { fetchedAt: "desc" },
      });

      const aggregate = tradeAggregates.get(asset.asset);
      const avgCost = aggregate?.averageCost ?? null;
      const currentValue = price?.price ? price.price.mul(balance.total) : null;
      const currentCost = avgCost ? avgCost.mul(balance.total) : null;
      const pnl =
        currentValue && currentCost ? currentValue.minus(currentCost) : null;

      await tx.domainCryptoAsset.upsert({
        where: { asset: asset.asset },
        update: {
          quantity: balance.total,
          price: price?.price ?? undefined,
          value: currentValue ?? undefined,
          quoteAsset: price?.quoteAsset ?? undefined,
          costBasis: avgCost ?? undefined,
          pnlUnrealized: pnl ?? undefined,
          metadataJson: JSON.stringify({
            balanceSnapshotId: balance.id,
            priceSnapshotId: price?.id,
            totalCostBasis: currentCost,
            realizedPnl: aggregate?.realizedPnl ?? null,
            lastTradeAt: aggregate?.lastTradeAt ?? null,
            firstTradeAt: aggregate?.firstTradeAt ?? null,
            tradeCount: aggregate?.tradeCount ?? 0,
          }),
        },
        create: {
          asset: asset.asset,
          quantity: balance.total,
          price: price?.price ?? undefined,
          value: currentValue ?? undefined,
          quoteAsset: price?.quoteAsset ?? undefined,
          sourceProvider: SourceProvider.BINANCE,
          sourceExternalId: asset.asset,
          costBasis: avgCost ?? undefined,
          pnlUnrealized: pnl ?? undefined,
          metadataJson: JSON.stringify({
            balanceSnapshotId: balance.id,
            priceSnapshotId: price?.id,
            totalCostBasis: currentCost,
            realizedPnl: aggregate?.realizedPnl ?? null,
            lastTradeAt: aggregate?.lastTradeAt ?? null,
            firstTradeAt: aggregate?.firstTradeAt ?? null,
            tradeCount: aggregate?.tradeCount ?? 0,
          }),
        },
      });

      projected += 1;
    }
  });

  await markDomainSyncState({
    stateKey: "domain:binance:crypto-assets",
    status: OpsRunStatus.SUCCESS,
    meta: { projected },
  });

  return { cryptoAssets: projected };
}

export async function projectPluggyReadModels() {
  await ensureDefaultCategories();

  const categories = await projectPluggyCategories();
  const accounts = await projectPluggyAccounts();
  const merchants = await projectPluggyMerchants();
  const transactions = await projectPluggyTransactions();
  const installmentGroups = await rebuildInstallmentGroups();
  const bills = await projectPluggyBills();
  const investments = await projectPluggyInvestments();

  return {
    categories,
    accounts,
    merchants,
    transactions,
    installmentGroups,
    bills,
    investments,
  };
}

export async function rebuildAllDomainReadModels() {
  await ensureDefaultCategories();

  const [pluggy, binance] = await Promise.all([
    projectPluggyReadModels(),
    projectBinanceReadModels(),
  ]);

  return {
    pluggy,
    binance,
  };
}

export async function reprocessProviderRecord(input: {
  provider: SourceProvider;
  resource: string;
  externalId: string;
}) {
  if (input.provider === SourceProvider.PLUGGY) {
    switch (input.resource) {
      case "transaction": {
        const record = await prisma.pluggyTransactionRecord.findUnique({
          where: { externalId: input.externalId },
        });
        if (!record) throw new Error("Registro Pluggy nao encontrado");
        await projectPluggyTransactions();
        return {
          provider: "PLUGGY",
          resource: "transaction",
          externalId: record.externalId,
        };
      }
      case "account": {
        const record = await prisma.pluggyAccountRecord.findUnique({
          where: { externalId: input.externalId },
        });
        if (!record) throw new Error("Registro Pluggy nao encontrado");
        await projectPluggyAccounts();
        return {
          provider: "PLUGGY",
          resource: "account",
          externalId: record.externalId,
        };
      }
      default:
        throw new Error(
          "Reprocessamento Pluggy nao suportado para esse recurso",
        );
    }
  }

  if (input.provider === SourceProvider.BINANCE) {
    switch (input.resource) {
      case "trade":
      case "asset":
        await projectBinanceReadModels();
        return {
          provider: "BINANCE",
          resource: input.resource,
          externalId: input.externalId,
        };
      default:
        throw new Error(
          "Reprocessamento Binance nao suportado para esse recurso",
        );
    }
  }

  throw new Error("Provider nao suportado");
}
