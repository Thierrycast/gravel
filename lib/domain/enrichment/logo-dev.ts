import { prisma } from "@/lib/prisma"

import { normalizeMerchantName } from "./normalization"

const LOGO_DEV_CDN = "https://img.logo.dev"
const LOGO_DEV_DESCRIBE_BASE = "https://api.logo.dev/describe"

const knownMerchantDomains: Record<string, string> = {
  adobe: "adobe.com",
  amazon: "amazon.com",
  apple: "apple.com",
  disney: "disney.com",
  google: "google.com",
  ifood: "ifood.com.br",
  microsoft: "microsoft.com",
  netflix: "netflix.com",
  spotify: "spotify.com",
  uber: "uber.com",
  youtube: "youtube.com",
}

function getPublishableKey() {
  return process.env.LOGO_DEV_PUBLISHABLE_KEY
}

function getSecretKey() {
  return process.env.LOGO_DEV_SECRET_KEY
}

function readDomainOverrides() {
  const raw = process.env.LOGO_DEV_DOMAIN_OVERRIDES_JSON
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

export function buildLogoDevUrl(domain: string) {
  const token = getPublishableKey()
  const params = new URLSearchParams()
  if (token) params.set("token", token)
  params.set("format", "png")
  params.set("size", "128")

  return `${LOGO_DEV_CDN}/${encodeURIComponent(domain)}?${params.toString()}`
}

export function buildLogoDevCryptoUrl(asset: string) {
  const token = getPublishableKey()
  if (!token) return null

  const params = new URLSearchParams({ token, format: "png", size: "128" })
  return `${LOGO_DEV_CDN}/crypto/${encodeURIComponent(asset.toLowerCase())}?${params.toString()}`
}

export function resolveMerchantDomain(name?: string | null) {
  const normalized = normalizeMerchantName(name)
  if (!normalized) return null

  const overrides = readDomainOverrides()
  if (overrides[normalized]) return overrides[normalized]

  for (const [needle, domain] of Object.entries({ ...knownMerchantDomains, ...overrides })) {
    if (normalized.includes(needle)) return domain
  }

  return null
}

type LogoDevDescribePayload = {
  name?: string
  domain?: string
  description?: string
  socials?: Record<string, string>
  logo?: string
}

export async function describeLogoDevDomain(domain: string) {
  const secret = getSecretKey()
  if (!secret) return null

  const response = await fetch(`${LOGO_DEV_DESCRIBE_BASE}/${encodeURIComponent(domain)}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Logo.dev Describe error: ${response.status} ${text}`.trim())
  }

  return (await response.json()) as LogoDevDescribePayload
}

export async function resolveMerchantLogoCache(options?: { limit?: number; describe?: boolean }) {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500)
  const now = new Date()
  const merchants = await prisma.domainMerchant.findMany({
    where: {
      OR: [
        { displayName: { not: "" } },
        { cnpj: { not: null } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  })

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const merchant of merchants) {
    const current = await prisma.merchantEnrichment.findUnique({
      where: { domainMerchantId: merchant.id },
    })

    if (current?.status === "SUCCESS" && current.expiresAt && current.expiresAt > now) {
      skipped += 1
      continue
    }

    const domain = current?.domain ?? resolveMerchantDomain(merchant.displayName)
    if (!domain) {
      await prisma.merchantEnrichment.upsert({
        where: { domainMerchantId: merchant.id },
        update: {
          normalizedName: normalizeMerchantName(merchant.displayName),
          status: "UNRESOLVED",
          lastResolvedAt: now,
          errorMessage: null,
        },
        create: {
          domainMerchantId: merchant.id,
          normalizedName: normalizeMerchantName(merchant.displayName),
          status: "UNRESOLVED",
          lastResolvedAt: now,
        },
      })
      skipped += 1
      continue
    }

    try {
      const described = options?.describe ? await describeLogoDevDomain(domain) : null
      const logoUrl = described?.logo ?? buildLogoDevUrl(domain)
      await prisma.merchantEnrichment.upsert({
        where: { domainMerchantId: merchant.id },
        update: {
          domain: described?.domain ?? domain,
          logoUrl,
          normalizedName: described?.name ?? normalizeMerchantName(merchant.displayName),
          description: described?.description ?? undefined,
          socialsJson: described?.socials ? JSON.stringify(described.socials) : undefined,
          source: "logo.dev",
          status: "SUCCESS",
          lastResolvedAt: now,
          lastDescribedAt: described ? now : current?.lastDescribedAt,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          errorMessage: null,
        },
        create: {
          domain: described?.domain ?? domain,
          logoUrl,
          normalizedName: described?.name ?? normalizeMerchantName(merchant.displayName),
          description: described?.description,
          socialsJson: described?.socials ? JSON.stringify(described.socials) : undefined,
          domainMerchantId: merchant.id,
          source: "logo.dev",
          status: "SUCCESS",
          lastResolvedAt: now,
          lastDescribedAt: described ? now : undefined,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      })
      await prisma.domainTransaction.updateMany({
        where: { domainMerchantId: merchant.id },
        data: { merchantLogoUrl: logoUrl },
      })
      updated += 1
    } catch (error) {
      failed += 1
      await prisma.merchantEnrichment.upsert({
        where: { domainMerchantId: merchant.id },
        update: {
          domain,
          status: "ERROR",
          lastResolvedAt: now,
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        },
        create: {
          domainMerchantId: merchant.id,
          domain,
          normalizedName: normalizeMerchantName(merchant.displayName),
          status: "ERROR",
          lastResolvedAt: now,
          errorMessage: error instanceof Error ? error.message : "Erro desconhecido",
        },
      })
    }
  }

  return { scanned: merchants.length, updated, skipped, failed }
}
