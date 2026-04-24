import type { DomainTransactionDirection, Prisma } from "@prisma/client"

import { displayNameFromRaw, normalizeFinancialText } from "./normalization"

type CategoryDisplay = {
  id: string
  name: string
  parentId?: string | null
}

type MerchantDisplay = {
  id: string
  displayName: string
}

type TransactionDisplayInput = {
  id: string
  description?: string | null
  normalizedDescription?: string | null
  amount: Prisma.Decimal
  occurredAt: Date
  direction: DomainTransactionDirection | string
  domainCategoryId?: string | null
  domainMerchantId?: string | null
  merchantName?: string | null
  merchantLogoUrl?: string | null
  currencyCode?: string | null
  ignored?: boolean
  installmentGroupId?: string | null
  installmentNumber?: number | null
  installmentTotal?: number | null
}

export function buildTransactionDisplay(
  transaction: TransactionDisplayInput,
  context: {
    category?: CategoryDisplay | null
    parentCategory?: CategoryDisplay | null
    merchant?: MerchantDisplay | null
    merchantLogoUrl?: string | null
    enrichmentStatus?: string | null
  }
) {
  const rawDescription = displayNameFromRaw(transaction.description) ?? "Sem descricao"
  const effectiveMerchant = context.merchant?.displayName ?? transaction.merchantName ?? null
  const displayTitle = effectiveMerchant ?? rawDescription
  const displaySubtitle =
    effectiveMerchant && effectiveMerchant !== rawDescription ? rawDescription : null

  return {
    id: transaction.id,
    description: rawDescription,
    displayTitle,
    displaySubtitle,
    rawDescription,
    normalizedDescription:
      transaction.normalizedDescription ?? normalizeFinancialText(transaction.description),
    amount: transaction.amount,
    date: transaction.occurredAt,
    direction: transaction.direction,
    categoryName: context.category?.name ?? "Sem categoria",
    categoryId: transaction.domainCategoryId ?? null,
    effectiveCategory: context.category?.name ?? "Nao categorizado",
    parentCategoryName: context.parentCategory?.name ?? null,
    merchantId: transaction.domainMerchantId ?? null,
    merchantName: effectiveMerchant,
    effectiveMerchant,
    merchantLogoUrl:
      transaction.merchantLogoUrl ?? context.merchantLogoUrl ?? null,
    enrichmentStatus: context.enrichmentStatus ?? null,
    currencyCode: transaction.currencyCode ?? "BRL",
    ignored: transaction.ignored ?? false,
    installmentGroupId: transaction.installmentGroupId ?? null,
    installmentNumber: transaction.installmentNumber ?? null,
    installmentTotal: transaction.installmentTotal ?? null,
  }
}
