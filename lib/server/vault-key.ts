import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { prisma } from "@/lib/prisma"

/**
 * Chave do cofre de segredos — gerada pelo próprio app, nunca pelo usuário.
 *
 * Por que não pedir ao usuário: a chave é **infraestrutura**, não configuração.
 * Num produto, quem conecta o banco não edita arquivo nem inventa chave de 32
 * bytes. E ela não pode vir da tela, porque a tela precisa dela para criptografar
 * o que você digita — ovo e galinha. Então o app gera no primeiro boot.
 *
 * Por que não derivar da senha mestre do usuário: o servidor precisa
 * descriptografar **sozinho**, às 02:30, quando o webhook da Pluggy chega e não
 * há ninguém para digitar nada. Chave derivada de senha tornaria impossível o
 * sync desassistido, que é a função central do app.
 *
 * Recuperação: a chave também fica guardada no banco, embrulhada por uma chave
 * derivada da senha mestre (`scrypt`). Assim o backup — que copia só o banco —
 * continua inútil sem a senha, mas um restore em máquina nova é possível
 * digitando a senha, em vez de perder o acesso aos segredos.
 */

const KEY_FILE_NAME = "secret.key"
const INTERNAL_TOKEN_FILE_NAME = "internal-token.key"
const RECOVERY_METADATA_KEY = "vault-key-recovery-v1"
const RECOVERY_ALGORITHM = "aes-256-gcm"
const RECOVERY_IV_BYTES = 12
const RECOVERY_KDF = { N: 16384, r: 8, p: 1 } as const

/**
 * Diretório de dados do app — o mesmo do SQLite, que já é volume persistente.
 * Derivado do `DATABASE_URL` para acompanhar dev (`./dev.db`) e produção
 * (`/app/data/prod.db`) sem configuração extra.
 */
function getDataDir() {
  const url = process.env.DATABASE_URL ?? ""
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length)
    return dirname(path.startsWith("/") ? path : join(process.cwd(), path))
  }
  return join(process.cwd(), "data")
}

function readOrCreateKeyFile(fileName: string, bytes: number): string {
  const dir = getDataDir()
  const file = join(dir, fileName)

  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim()
    if (existing.length > 0) return existing
  }

  const value = randomBytes(bytes).toString("hex")
  mkdirSync(dir, { recursive: true })
  // 0600 antes de escrever seria melhor, mas o writeFileSync com mode só vale na
  // criação; o chmod explícito cobre o caso do arquivo já existir vazio.
  writeFileSync(file, `${value}\n`, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Sistemas de arquivo sem suporte a permissão POSIX (bind mount exótico).
  }
  console.log(`[vault] chave gerada em ${file} (primeiro boot)`)
  return value
}

/**
 * Chave do cofre. Precedência: variável de ambiente (override para quem faz
 * deploy declarativo) e, na ausência dela, o arquivo autogerado no volume.
 */
export function resolveVaultKey(): string {
  const fromEnv = process.env.APP_SECRETS_ENCRYPTION_KEY?.trim()
  if (fromEnv) return fromEnv
  return readOrCreateKeyFile(KEY_FILE_NAME, 32)
}

/**
 * Token das rotas internas. Também autogerado: num produto o usuário não
 * inventa esse valor — o app o entrega, e a UI o exibe para quem quiser chamar
 * a CLI ou um cron externo.
 */
export function resolveInternalToken(): string {
  const fromEnv = process.env.INTERNAL_API_KEY?.trim()
  if (fromEnv) return fromEnv
  return readOrCreateKeyFile(INTERNAL_TOKEN_FILE_NAME, 24)
}

/**
 * Popula `process.env` com os dois valores no boot, para que o código que os lê
 * de forma síncrona (`ensureInternalApiKey` em 22 rotas) continue funcionando
 * sem virar assíncrono.
 */
export function bootstrapVaultKeys() {
  const vaultKey = resolveVaultKey()
  const internalToken = resolveInternalToken()
  process.env.APP_SECRETS_ENCRYPTION_KEY = vaultKey
  process.env.INTERNAL_API_KEY = internalToken
  return { vaultKey, internalToken }
}

// ── Recuperação embrulhada pela senha mestre ────────────────────────────────

function deriveRecoveryKey(masterPassword: string, salt: Buffer) {
  return scryptSync(masterPassword, salt, 32, RECOVERY_KDF)
}

/**
 * Guarda a chave do cofre no banco, cifrada sob a senha mestre. Chamado quando o
 * usuário define ou troca a senha — é o que permite restaurar um backup (que só
 * contém o banco) numa máquina nova.
 */
export async function storeVaultKeyRecovery(masterPassword: string) {
  const vaultKey = resolveVaultKey()
  const salt = randomBytes(16)
  const iv = randomBytes(RECOVERY_IV_BYTES)
  const cipher = createCipheriv(
    RECOVERY_ALGORITHM,
    deriveRecoveryKey(masterPassword, salt),
    iv,
  )
  const cipherText = Buffer.concat([
    cipher.update(vaultKey, "utf8"),
    cipher.final(),
  ])

  const payload = JSON.stringify({
    algorithm: RECOVERY_ALGORITHM,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    cipherText: cipherText.toString("base64"),
  })

  await prisma.systemMetadata.upsert({
    where: { key: RECOVERY_METADATA_KEY },
    update: { value: payload },
    create: { key: RECOVERY_METADATA_KEY, value: payload },
  })
}

export async function hasVaultKeyRecovery() {
  const row = await prisma.systemMetadata.findUnique({
    where: { key: RECOVERY_METADATA_KEY },
    select: { key: true },
  })
  return Boolean(row)
}

/**
 * Recupera a chave do cofre a partir da senha mestre e a grava no arquivo local.
 * Usado após restaurar um backup numa máquina nova, onde o volume — e portanto o
 * `secret.key` — não existe.
 */
export async function recoverVaultKey(masterPassword: string) {
  const row = await prisma.systemMetadata.findUnique({
    where: { key: RECOVERY_METADATA_KEY },
  })
  if (!row) {
    return { recovered: false as const, reason: "sem-blob-de-recuperacao" }
  }

  let parsed: {
    algorithm: string
    salt: string
    iv: string
    authTag: string
    cipherText: string
  }
  try {
    parsed = JSON.parse(row.value)
  } catch {
    return { recovered: false as const, reason: "blob-corrompido" }
  }

  try {
    const decipher = createDecipheriv(
      RECOVERY_ALGORITHM,
      deriveRecoveryKey(masterPassword, Buffer.from(parsed.salt, "base64")),
      Buffer.from(parsed.iv, "base64"),
    )
    decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"))
    const vaultKey = Buffer.concat([
      decipher.update(Buffer.from(parsed.cipherText, "base64")),
      decipher.final(),
    ]).toString("utf8")

    const file = join(getDataDir(), KEY_FILE_NAME)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${vaultKey}\n`, { mode: 0o600 })
    try {
      chmodSync(file, 0o600)
    } catch {
      // idem readOrCreateKeyFile
    }
    process.env.APP_SECRETS_ENCRYPTION_KEY = vaultKey

    return { recovered: true as const }
  } catch {
    // GCM falha determinística: senha errada.
    return { recovered: false as const, reason: "senha-incorreta" }
  }
}

/** Exposto para teste. */
export const vaultKeyInternals = { getDataDir, KEY_FILE_NAME, RECOVERY_METADATA_KEY }
