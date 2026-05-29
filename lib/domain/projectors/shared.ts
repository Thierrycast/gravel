import { randomUUID } from "node:crypto";
import {
  DomainCategoryKind,
  Prisma,
  RuleMatchType,
  SourceProvider,
  CategoryRule,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function normalizeText(value?: string | null) {
  return (
    value
      ?.normalize("NFKD")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase() ?? null
  );
}

export function titleCaseMerchant(name: string): string {
  return name
    .split(" ")
    .slice(0, 8)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function cleanMerchantName(name?: string | null): string {
  if (!name) return "";

  let cleaned = name.trim();

  const paymentPrefixes = [
    /^(pagamento com qr pix|pagamento de boleto|pagamento pix|pagamento ted|pagamento doc|pagamento)\b\s*/i,
    /^(compra no debito|compra no credito|compra debito|compra credito|compra internacional|compra parcelada|estabelecimento comercial|estabelecimento)\b\s*/i,
    /^(pgto qr pix|pgto pix|pgto|pix qr|pix|ted|doc|transf|transferencia)\b\s*/i,
    /^(recarga|maquininha)\b\s*/i,
    /^(mp|pg|ec|ipg|dlocal)\b[-*]?\s*/i,
  ];

  for (const regex of paymentPrefixes) {
    cleaned = cleaned.replace(regex, "");
  }

  const corporateSuffixes = [
    /\s+\b(ltda|s\/a|s\.a\.|s\.a|sa|m\.e\.|me|eireli|epp|mei|limitada|servicos|comercio|e cia|cia)\b\.?$/i,
  ];

  for (const regex of corporateSuffixes) {
    cleaned = cleaned.replace(regex, "");
  }

  const normalized = normalizeText(cleaned);
  if (!normalized || normalized.trim().length === 0) {
    return normalizeText(name) ?? "";
  }

  return normalized;
}

export function isPaymentFacilitatorOrBank(
  name?: string | null,
  cnpj?: string | null,
): boolean {
  if (cnpj) {
    const cleanCnpj = cnpj.replace(/\D/g, "");
    const facilitatorCnpjs = new Set([
      "10573521000191", // Mercado Pago
      "08561701000101", // PagSeguro
      "22896431000110", // PicPay
      "16501555000119", // Stone
      "02030491000187", // Cielo
      "01425787000104", // Rede
      "10440482000154", // Getnet
      "25021356000132", // DLocal
      "13009772000119", // Ebanx
      "19897161000164", // Zoop
      "19540550000121", // Asaas
      "15111975000164", // Iugu
      "16668155000102", // SumUp
    ]);
    if (facilitatorCnpjs.has(cleanCnpj)) {
      return true;
    }
  }

  if (name) {
    const normalized = normalizeText(name);
    if (!normalized) return false;

    const facilitatorKeywords = [
      "mercado pago",
      "pagseguro",
      "picpay",
      "stone pagamentos",
      "stone ip",
      "cielo s a",
      "cielo sa",
      "redecard",
      "getnet",
      "dlocal",
      "ebanx",
      "zoop tecnologia",
      "asaas gestao",
      "iugu servicos",
      "sumup",
      "nu pagamentos",
      "nubank",
      "banco inter",
      "inter medium",
      "c6 bank",
      "itau unibanco",
      "banco bradesco",
      "banco santander",
      "caixa economica",
      "banco do brasil",
      "neon pagamentos",
    ];

    return facilitatorKeywords.some((keyword) => normalized.includes(keyword));
  }

  return false;
}

export function extractDocumentFromText(text?: string | null): string | null {
  if (!text) return null;

  const cnpjMatch = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  if (cnpjMatch) {
    const cleaned = cnpjMatch[0].replace(/\D/g, "");
    if (cleaned.length === 14) return cleaned;
  }

  const cpfMatch = text.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  if (cpfMatch) {
    const cleaned = cpfMatch[0].replace(/\D/g, "");
    if (cleaned.length === 11) return cleaned;
  }

  const digits14 = text.match(/\b\d{14}\b/);
  if (digits14) return digits14[0];

  const digits11 = text.match(/\b\d{11}\b/);
  if (digits11) return digits11[0];

  return null;
}


export function evaluateRule(
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

export function mapCategoryKind(sourceName?: string | null) {
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

export async function ensureDefaultCategories() {
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

export async function ensureMerchant(
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

export async function resolveCategoryId(
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

export type MerchantLike = {
  id: string;
  displayName: string;
  normalizedName: string;
  cnpj: string | null;
};

export function resolveMerchantInMemory(
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
    pendingMerchantUpdates?: {
      id: string;
      cnpj: string;
    }[];
  },
): MerchantLike | null {
  const ensure = (input: {
    displayName: string;
    cnpj?: string | null;
    sourceExternalId?: string | null;
    sourceProvider: SourceProvider;
  }): MerchantLike => {
    const cleanedName = cleanMerchantName(input.displayName);
    const normalizedName = cleanedName || normalizeText(input.displayName) || "merchant";

    if (input.sourceExternalId) {
      const existingSrc = ctx.merchantSourceByExtId.get(input.sourceExternalId);
      if (existingSrc) {
        const merchant = ctx.merchantsById.get(existingSrc.domainMerchantId);
        if (merchant) return merchant;
      }
    }

    let merchant: MerchantLike | undefined =
      (input.cnpj ? ctx.merchantByCnpj.get(input.cnpj) : undefined) ??
      ctx.merchantByNormalized.get(normalizedName);

    if (merchant && !merchant.cnpj && input.cnpj) {
      merchant.cnpj = input.cnpj;
      ctx.merchantByCnpj.set(input.cnpj, merchant);

      if (ctx.pendingMerchantUpdates) {
        const alreadyFiled = ctx.pendingMerchantUpdates.some((u) => u.id === merchant!.id);
        if (!alreadyFiled) {
          ctx.pendingMerchantUpdates.push({
            id: merchant.id,
            cnpj: input.cnpj,
          });
        }
      }

      const pendingIndex = ctx.pendingMerchants.findIndex((m) => m.id === merchant!.id);
      if (pendingIndex !== -1) {
        ctx.pendingMerchants[pendingIndex].cnpj = input.cnpj;
      }
    }

    if (!merchant) {
      const newMerchant: MerchantLike = {
        id: randomUUID(),
        displayName: titleCaseMerchant(cleanedName) || input.displayName,
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

  const merchantName = cleanMerchantName(input.merchantName);
  if (!merchantName) return null;

  if (isPaymentFacilitatorOrBank(merchantName, null)) {
    return null;
  }

  let effectiveCnpj = input.merchantCnpj ?? null;
  if (effectiveCnpj && isPaymentFacilitatorOrBank(null, effectiveCnpj)) {
    effectiveCnpj = null;
  }

  for (const rule of ctx.rules) {
    const candidate =
      effectiveCnpj && rule.matchValue === effectiveCnpj
        ? effectiveCnpj
        : merchantName;

    if (!evaluateRule(rule.matchType, rule.matchValue, candidate)) continue;

    if (rule.merchantId) {
      const merchant = ctx.merchantsById.get(rule.merchantId);
      if (merchant) return merchant;
    }

    if (rule.aliasName) {
      return ensure({
        displayName: rule.aliasName,
        cnpj: effectiveCnpj,
        sourceProvider: input.sourceProvider,
      });
    }
  }

  if (input.merchantName) {
    return ensure({
      displayName: input.merchantName,
      cnpj: effectiveCnpj,
      sourceProvider: input.sourceProvider,
    });
  }

  return null;
}


export function inferBillStatus(
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
    // If due date was more than 90 days ago, likely paid/closed or abandoned
    const daysPast = Math.floor(
      (today.getTime() - dueDay.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysPast > 90) return "CLOSED";
    return "OVERDUE";
  }


  return "OPEN";
}

export function hasManualBillPayment(metadataJson?: string | null) {
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
