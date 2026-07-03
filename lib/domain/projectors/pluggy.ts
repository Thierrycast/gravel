import { randomUUID } from "node:crypto";
import {
  DomainAccountKind,
  DomainTransactionDirection,
  OpsRunStatus,
  Prisma,
  SourceProvider,
} from "@prisma/client";
import { markDomainSyncState } from "@/lib/admin/ops";
import {
  detectExplicitInstallment,
  rebuildInstallmentGroups,
  stripInstallmentMarker,
} from "@/lib/domain/installments";
import { prisma } from "@/lib/prisma";
import {
  normalizeText,
  mapCategoryKind,
  ensureDefaultCategories,
  ensureMerchant,
  resolveCategoryId,
  resolveMerchantInMemory,
  inferBillStatus,
  hasManualBillPayment,
  MerchantLike,
  extractDocumentFromText,
} from "@/lib/domain/projectors/shared";

export function normalizePluggyTransactionAmount(
  rawAmount: Prisma.Decimal,
  accountType: string | null | undefined,
): Prisma.Decimal {
  if (accountType === "CREDIT") {
    return rawAmount.negated();
  }
  return rawAmount;
}

export function mapPluggyAccountKind(type?: string | null): DomainAccountKind {
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

function titleCaseMerchant(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function deriveMerchantNameFromDescription(
  description?: string | null,
  descriptionRaw?: string | null,
) {
  let normalized =
    stripInstallmentMarker(description) ??
    stripInstallmentMarker(descriptionRaw) ??
    normalizeText(description ?? descriptionRaw);

  if (!normalized || normalized.length < 3) return null;
  if (
    /^(pix|ted|doc|transferencia|transfer|resgate|aplicacao|saque|deposito|estorno|saldo|rendimento|iof|juros|encargos|tarifa|multa|inclusao de pagamento|pagamento de fatura|debito automatico fatura|boleto recebido)\b/.test(
      normalized,
    )
  ) {
    return null;
  }

  normalized = normalized.replace(
    /^(compra no debito|compra no credito|compra debito|compra credito|compra internacional|compra parcelada|credito de)\b\s*/,
    "",
  );

  if (!normalized || normalized.length < 3) return null;

  return titleCaseMerchant(normalized);
}

async function pruneUnreferencedDomainMerchants() {
  const [sources, enrichments, aliasRules, recurringRules] = await Promise.all([
    prisma.domainMerchantSource.findMany({
      select: { domainMerchantId: true },
    }),
    prisma.merchantEnrichment.findMany({
      select: { domainMerchantId: true },
    }),
    prisma.merchantAliasRule.findMany({
      where: { merchantId: { not: null } },
      select: { merchantId: true },
    }),
    prisma.domainRecurringRule.findMany({
      where: { merchantId: { not: null } },
      select: { merchantId: true },
    }),
  ]);

  const protectedMerchantIds = Array.from(
    new Set(
      [
        ...sources.map((source) => source.domainMerchantId),
        ...enrichments.map((enrichment) => enrichment.domainMerchantId),
        ...aliasRules.map((rule) => rule.merchantId),
        ...recurringRules.map((rule) => rule.merchantId),
      ].filter((id): id is string => Boolean(id)),
    ),
  );

  return prisma.domainMerchant.deleteMany({
    where: {
      transactions: { none: {} },
      ...(protectedMerchantIds.length > 0
        ? { id: { notIn: protectedMerchantIds } }
        : {}),
    },
  });
}

export async function projectPluggyCategories() {
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

export async function projectPluggyAccounts() {
  const records = await prisma.pluggyAccountRecord.findMany();
  const items = await prisma.pluggyItem.findMany();
  const itemMap = new Map(
    items.map((i) => [i.pluggyItemId, { connectorName: i.connectorName }]),
  );
  let projected = 0;

  await prisma.$transaction(async (tx) => {
    for (const record of records) {
      const item = itemMap.get(record.itemExternalId);
      const institutionName = item?.connectorName ?? null;
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
          institutionName: institutionName ?? undefined,
          imageUrl: null,
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
          institutionName: institutionName ?? undefined,
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

export async function projectPluggyMerchants() {
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

export async function projectPluggyTransactions() {
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
      .filter((account) => account.sourceExternalId !== null)
      .map((account) => [account.sourceExternalId as string, account.id]),
  );
  const accountTypeMap = new Map<string, string | null>(
    pluggyAccounts.map((account) => [account.externalId, account.type]),
  );
  const categoriesBySlug = new Map<string, string>(
    categories.map((category) => [category.slug, category.id]),
  );
  const categoriesBySource = new Map<string, string>(
    categories
      .filter(
        (category) => category.sourceProvider === SourceProvider.PLUGGY && category.sourceExternalId,
      )
      .map((category) => [
        `${category.sourceProvider}:${category.sourceExternalId as string}`,
        category.id,
      ]),
  );
  const categoriesByName = new Map<string, string>(
    categories.map((category) => [
      normalizeText(category.name) ?? category.name.toLowerCase(),
      category.id,
    ]),
  );
  const ignoredIds = new Set(ignoredRows.map((row) => row.domainTransactionId));

  const merchantsById = new Map<string, MerchantLike>(
    existingMerchants.map((merchant) => [merchant.id, merchant]),
  );
  const merchantByCnpj = new Map<string, MerchantLike>(
    existingMerchants
      .filter((merchant): merchant is MerchantLike & { cnpj: string } => merchant.cnpj !== null)
      .map((merchant) => [merchant.cnpj, merchant]),
  );
  const merchantByNormalized = new Map<string, MerchantLike>(
    existingMerchants.map((merchant) => [merchant.normalizedName, merchant]),
  );
  const merchantSourceByExtId = new Map<string, { domainMerchantId: string }>(
    existingMerchantSources.map((source) => [
      source.sourceExternalId,
      { domainMerchantId: source.domainMerchantId },
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
  const pendingMerchantUpdates: {
    id: string;
    cnpj: string;
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

    const externalIds = chunkRecords.map((record) => record.externalId);
    const [existingTransactions, existingTransactionSources, payloadSnapshots] =
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
        prisma.pluggyPayloadSnapshot.findMany({
          where: {
            resourceType: "transaction",
            externalId: { in: externalIds },
          },
          select: {
            externalId: true,
            payloadJson: true,
          },
        }),
      ]);
    const snapshotByTxId = new Map<string, string>(
      payloadSnapshots.map((snap) => [snap.externalId, snap.payloadJson]),
    );

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
      existingTransactions.map((transaction) => [
        transaction.sourceExternalId,
        { id: transaction.id, metadataJson: transaction.metadataJson },
      ]),
    );
    const existingSourceByExtId = new Map<
      string,
      { id: string; domainTransactionId: string }
    >(
      existingTransactionSources.map((source) => [
        source.sourceExternalId,
        { id: source.id, domainTransactionId: source.domainTransactionId },
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
      const snapshotJson = snapshotByTxId.get(record.externalId);
      let payloadMerchantCnpj: string | null = null;
      let payloadMerchantName: string | null = null;
      if (snapshotJson) {
        try {
          const payload = JSON.parse(snapshotJson);
          if (payload.paymentData?.receiver?.documentNumber?.value) {
            payloadMerchantCnpj = String(payload.paymentData.receiver.documentNumber.value);
          }
          if (payload.paymentData?.receiver?.name) {
            payloadMerchantName = String(payload.paymentData.receiver.name);
          }
        } catch {}
      }

      const fallbackMerchantName = deriveMerchantNameFromDescription(
        overrides.description ?? record.description,
        record.descriptionRaw,
      );
      const effectiveMerchantName =
        overrides.merchantName ??
        record.merchantName ??
        payloadMerchantName ??
        enrichment?.merchantBusinessName ??
        enrichment?.merchantName ??
        fallbackMerchantName ??
        null;
      const effectiveMerchantCnpj =
        record.merchantCnpj ??
        payloadMerchantCnpj ??
        enrichment?.merchantCnpj ??
        extractDocumentFromText(overrides.description ?? record.description) ??
        extractDocumentFromText(record.descriptionRaw) ??
        null;

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
            pendingMerchantUpdates,
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
      // Origem da categoria efetiva, para a UI e para não sobrescrever edição
      // manual: MANUAL (override do usuário) > PLUGGY (provedor/enriquecimento).
      let categorySource: string | null = record.categoryId
        ? "PLUGGY"
        : !record.categoryId && enrichment?.pluggyCategory && categoryId
          ? "PLUGGY"
          : null;
      if ("categoryId" in overrides) {
        categoryId = overrides.categoryId ?? null;
        categorySource = categoryId ? "MANUAL" : null;
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
        updateData.categorySource = categorySource;
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
          categorySource,
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
      if (pendingMerchantUpdates.length > 0) {
        for (const update of pendingMerchantUpdates) {
          await tx.domainMerchant.update({
            where: { id: update.id },
            data: { cnpj: update.cnpj },
          });
        }
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
    });

    pendingMerchants.length = 0;
    pendingMerchantSources.length = 0;
    pendingMerchantUpdates.length = 0;

    skip += BATCH_SIZE;
    projected += chunkRecords.length;
  }

  const prunedMerchants = await pruneUnreferencedDomainMerchants();

  await markDomainSyncState({
    stateKey: "domain:pluggy:transactions",
    status: OpsRunStatus.SUCCESS,
    meta: { projected, prunedMerchants: prunedMerchants.count },
  });

  return projected;
}

export async function projectPluggyBills() {
  const records = await prisma.pluggyBillRecord.findMany();

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

export async function projectPluggyInvestments() {
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
