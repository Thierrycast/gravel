import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, scryptSync, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

import { resolveVaultKey } from "./vault-key"

const scrypt = promisify(scryptCallback)
const MASTER_PASSWORD_PREFIX = "scrypt"
const SECRET_ALGORITHM = "aes-256-gcm"
const SECRET_IV_BYTES = 12
let appSecretTableState: "unknown" | "ready" | "missing" = "unknown"

const secretDefinitions = [
  {
    key: "PLUGGY_CLIENT_ID",
    provider: "Pluggy",
    label: "Client ID",
    description: "Credencial principal para gerar tokens de conexao do Pluggy.",
  },
  {
    key: "PLUGGY_CLIENT_SECRET",
    provider: "Pluggy",
    label: "Client Secret",
    description: "Segredo usado para autenticar chamadas server-side no Pluggy.",
  },
  {
    key: "PLUGGY_WEBHOOK_SECRET",
    provider: "Pluggy",
    label: "Webhook Secret",
    description:
      "Gerado pelo app e informado à Pluggy no registro do webhook. Você não precisa administrá-lo.",
    // Não é credencial de terceiro: o app inventa este valor e o comunica à
    // Pluggy. Como as outras chaves de infraestrutura, não deve pedir digitação.
    managedByApp: true,
  },
  {
    key: "BINANCE_API_KEY",
    provider: "Binance",
    label: "API Key",
    description: "Chave publica usada para consultar conta, trades e saldos da Binance.",
  },
  {
    key: "BINANCE_API_SECRET",
    provider: "Binance",
    label: "API Secret",
    description: "Segredo usado para assinar requests autenticadas da Binance.",
  },
  {
    key: "VAPID_PUBLIC_KEY",
    provider: "Notificações push",
    label: "VAPID Public Key",
    description:
      "Chave pública do Web Push. Servida ao browser em runtime por /api/push/key.",
  },
  {
    key: "VAPID_PRIVATE_KEY",
    provider: "Notificações push",
    label: "VAPID Private Key",
    description: "Assina as notificações push enviadas pelo servidor.",
  },
  {
    key: "LOGO_DEV_SECRET_KEY",
    provider: "Logo.dev",
    label: "Secret Key",
    description: "Segredo usado nas chamadas Describe da Logo.dev.",
  },
  {
    key: "AI_API_KEY",
    provider: "Briefing por IA",
    label: "API Key",
    description: "Credencial do provider Anthropic ou OpenAI-compatible usado no briefing.",
  },
] as const

export type ManagedSecretKey = (typeof secretDefinitions)[number]["key"]
export type ManagedSecretSource = "database" | "environment" | "unset"

export type ManagedSecretStatus = {
  key: ManagedSecretKey
  provider: string
  label: string
  description: string
  effectiveSource: ManagedSecretSource
  /** Gerado e rotacionado pelo próprio app — não é para o usuário digitar. */
  managedByApp: boolean
  hasDatabaseValue: boolean
  hasEnvironmentValue: boolean
  canPersistToDatabase: boolean
}

type AppSecretRecord = {
  key: string
  cipherText: string
  iv: string
  authTag: string
  algorithm: string
}

function isMissingAppSecretTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    typeof error.meta?.table === "string" &&
    error.meta.table.includes("AppSecret")
  )
}

function markAppSecretTableReady() {
  appSecretTableState = "ready"
}

function markAppSecretTableMissing() {
  appSecretTableState = "missing"
}

/**
 * Valores de preenchimento ("COLE_O_NOVO_AQUI", "<sua-chave>", "changeme"...)
 * contam como *ausentes*. Sem isso o app se julga configurado, o agendador bate
 * no provedor a cada tick e o log vira uma fileira de 401 em vez da mensagem
 * "credencial não configurada" que a tela de Configurações já sabe mostrar.
 */
const placeholderSecretPattern =
  /^(?:<[^>]*>|(?:cole|coloque|preencha|substitua|insira|your|seu|sua|change|changeme|replace|todo|fixme|placeholder|example|dummy|x{3,})[a-z0-9_\- ]*)$/i

function isPlaceholderSecret(value: string) {
  return placeholderSecretPattern.test(value)
}

function normalizeSecretValue(value?: string | null) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (normalized.length === 0) return null
  return isPlaceholderSecret(normalized) ? null : normalized
}

function getEncryptionPassphrase() {
  // `resolveVaultKey` usa a env quando existe e, na ausência dela, o arquivo
  // autogerado no volume de dados — o usuário nunca precisa criar essa chave.
  try {
    return normalizeSecretValue(resolveVaultKey())
  } catch {
    return normalizeSecretValue(process.env.APP_SECRETS_ENCRYPTION_KEY)
  }
}

const KDF_SALT = Buffer.from("gravel-app-secrets-kdf-v1", "utf8")

function getEncryptionKey(legacy = false) {
  const passphrase = getEncryptionPassphrase()
  if (!passphrase) {
    throw new Error(
      "Chave do cofre indisponível. Ela é gerada automaticamente no primeiro boot; verifique se o diretório de dados é gravável."
    )
  }
  if (legacy) {
    // Used only to decrypt secrets stored before the scrypt migration
    return createHash("sha256").update(passphrase).digest()
  }
  return scryptSync(passphrase, KDF_SALT, 32, { N: 16384, r: 8, p: 1 })
}

function encryptSecret(value: string) {
  const iv = randomBytes(SECRET_IV_BYTES)
  const cipher = createCipheriv(SECRET_ALGORITHM, getEncryptionKey(), iv)
  const cipherText = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    cipherText: cipherText.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    algorithm: SECRET_ALGORITHM,
  }
}

function decryptSecret(record: AppSecretRecord) {
  if (record.algorithm !== SECRET_ALGORITHM) {
    throw new Error(`Algoritmo de segredo nao suportado: ${record.algorithm}`)
  }

  // Try scrypt-derived key first; fall back to legacy SHA-256 for records written before this change.
  // GCM auth tag verification fails fast and deterministically when the key is wrong.
  for (const legacy of [false, true]) {
    try {
      const key = getEncryptionKey(legacy)
      const decipher = createDecipheriv(record.algorithm, key, Buffer.from(record.iv, "base64"))
      decipher.setAuthTag(Buffer.from(record.authTag, "base64"))
      const plainText = Buffer.concat([
        decipher.update(Buffer.from(record.cipherText, "base64")),
        decipher.final(),
      ]).toString("utf8")
      return normalizeSecretValue(plainText)
    } catch {
      if (!legacy) continue
      throw new Error("Falha ao descriptografar segredo. Verifique APP_SECRETS_ENCRYPTION_KEY.")
    }
  }
}

function isHashEncoded(value: string) {
  return value.startsWith(`${MASTER_PASSWORD_PREFIX}$`)
}

function serializeHash(parts: { salt: Buffer; derived: Buffer }) {
  return [
    MASTER_PASSWORD_PREFIX,
    parts.salt.toString("base64"),
    parts.derived.toString("base64"),
  ].join("$")
}

function parseHash(value: string) {
  const [prefix, saltBase64, derivedBase64] = value.split("$")
  if (prefix !== MASTER_PASSWORD_PREFIX || !saltBase64 || !derivedBase64) {
    return null
  }

  try {
    return {
      salt: Buffer.from(saltBase64, "base64"),
      derived: Buffer.from(derivedBase64, "base64"),
    }
  } catch {
    return null
  }
}

export async function hashMasterPassword(password: string) {
  const normalized = normalizeSecretValue(password)
  if (!normalized) {
    throw new Error("A senha mestre nao pode ser vazia.")
  }

  const salt = randomBytes(16)
  const derived = (await scrypt(normalized, salt, 64)) as Buffer
  return serializeHash({ salt, derived })
}

export async function verifyMasterPassword(
  password: string,
  storedHash?: string | null
) {
  const normalizedPassword = normalizeSecretValue(password)
  const normalizedStored = normalizeSecretValue(storedHash)

  if (!normalizedPassword || !normalizedStored) {
    return { valid: false, migratedHash: null as string | null }
  }

  if (!isHashEncoded(normalizedStored)) {
    const valid = normalizedStored === normalizedPassword
    return {
      valid,
      migratedHash: valid ? await hashMasterPassword(normalizedPassword) : null,
    }
  }

  const parsed = parseHash(normalizedStored)
  if (!parsed) {
    return { valid: false, migratedHash: null as string | null }
  }

  const derived = (await scrypt(normalizedPassword, parsed.salt, parsed.derived.length)) as Buffer
  const valid =
    derived.length === parsed.derived.length &&
    timingSafeEqual(derived, parsed.derived)

  return { valid, migratedHash: null as string | null }
}

export function hasVaultMasterPassword(storedHash?: string | null) {
  return Boolean(normalizeSecretValue(storedHash))
}

export function canPersistSecretsToDatabase() {
  return Boolean(getEncryptionPassphrase())
}

export function getManagedSecretDefinitions() {
  return [...secretDefinitions]
}

export async function getManagedSecretValue(key: ManagedSecretKey) {
  try {
    if (appSecretTableState === "missing") {
      throw new Error("__APP_SECRET_TABLE_MISSING__")
    }
    const secret = await prisma.appSecret.findUnique({ where: { key } })
    markAppSecretTableReady()
    if (secret) {
      const decrypted = decryptSecret(secret)
      if (decrypted) {
        return { value: decrypted, source: "database" as const }
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "__APP_SECRET_TABLE_MISSING__"
    ) {
      markAppSecretTableMissing()
    } else if (isMissingAppSecretTableError(error)) {
      markAppSecretTableMissing()
    } else {
      throw error
    }
  }

  const fromEnv = normalizeSecretValue(process.env[key])
  if (fromEnv) {
    return { value: fromEnv, source: "environment" as const }
  }

  return { value: null, source: "unset" as const }
}

export async function setManagedSecretValue(
  key: ManagedSecretKey,
  value: string | null
) {
  const normalized = normalizeSecretValue(value)
  if (!normalized) {
    try {
      if (appSecretTableState === "missing") return
      await prisma.appSecret.deleteMany({ where: { key } })
      markAppSecretTableReady()
    } catch (error) {
      if (isMissingAppSecretTableError(error)) {
        markAppSecretTableMissing()
      } else {
        throw error
      }
    }
    return
  }

  const encrypted = encryptSecret(normalized)
  if (appSecretTableState === "missing") {
    throw new Error(
      "Tabela AppSecret ausente no banco atual. Rode a migracao antes de salvar segredos no painel."
    )
  }
  try {
    await prisma.appSecret.upsert({
      where: { key },
      update: encrypted,
      create: {
        key,
        ...encrypted,
      },
    })
    markAppSecretTableReady()
  } catch (error) {
    if (isMissingAppSecretTableError(error)) {
      markAppSecretTableMissing()
      throw new Error(
        "Tabela AppSecret ausente no banco atual. Rode a migracao antes de salvar segredos no painel."
      )
    }
    throw error
  }
}

export async function listManagedSecretStatuses(): Promise<ManagedSecretStatus[]> {
  const keys = secretDefinitions.map((definition) => definition.key)
  let rows: Array<{ key: string }> = []
  let databaseReady = appSecretTableState !== "missing"

  if (appSecretTableState !== "missing") {
    try {
      rows = await prisma.appSecret.findMany({
        where: {
          key: {
            in: [...keys],
          },
        },
        select: {
          key: true,
        },
      })
      markAppSecretTableReady()
    } catch (error) {
      if (!isMissingAppSecretTableError(error)) {
        throw error
      }
      markAppSecretTableMissing()
      databaseReady = false
    }
  }

  const dbKeys = new Set(rows.map((row) => row.key))
  const canPersist = canPersistSecretsToDatabase() && databaseReady

  return secretDefinitions.map((definition) => {
    const hasDatabaseValue = dbKeys.has(definition.key)
    const hasEnvironmentValue = Boolean(normalizeSecretValue(process.env[definition.key]))

    return {
      ...definition,
      managedByApp: "managedByApp" in definition && definition.managedByApp === true,
      effectiveSource: hasDatabaseValue
        ? "database"
        : hasEnvironmentValue
          ? "environment"
          : "unset",
      hasDatabaseValue,
      hasEnvironmentValue,
      canPersistToDatabase: canPersist,
    }
  })
}

export function isManagedSecretKey(key: string): key is ManagedSecretKey {
  return secretDefinitions.some((definition) => definition.key === key)
}
