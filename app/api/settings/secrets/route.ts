import { jsonError, jsonOk } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"
import {
  canPersistSecretsToDatabase,
  isManagedSecretKey,
  listManagedSecretStatuses,
  setManagedSecretValue,
  verifyMasterPassword,
} from "@/lib/server/secret-store"

type SecretsPayload = {
  masterPassword?: string
  secrets?: Record<string, string | null>
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SecretsPayload
    const settings = await prisma.userSetting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })

    if (!settings.vaultMasterPassword) {
      return jsonError(
        new Error("Defina uma senha mestre antes de salvar credenciais no painel."),
        409
      )
    }

    const verification = await verifyMasterPassword(
      body.masterPassword ?? "",
      settings.vaultMasterPassword
    )

    if (!verification.valid) {
      return jsonError(new Error("Senha mestre incorreta."), 401)
    }

    const entries = Object.entries(body.secrets ?? {})
    if (entries.length === 0) {
      return jsonError(new Error("Nenhuma credencial foi enviada."), 400)
    }

    if (!canPersistSecretsToDatabase()) {
      return jsonError(
        new Error(
          "APP_SECRETS_ENCRYPTION_KEY nao configurada. Defina essa chave no ambiente antes de usar credenciais salvas no banco."
        ),
        409
      )
    }

    const updatedKeys: string[] = []
    for (const [key, value] of entries) {
      if (!isManagedSecretKey(key)) {
        return jsonError(new Error(`Credencial nao suportada: ${key}`), 400)
      }
      await setManagedSecretValue(key, value)
      updatedKeys.push(key)
    }

    if (verification.migratedHash) {
      await prisma.userSetting.update({
        where: { id: "default" },
        data: {
          vaultMasterPassword: verification.migratedHash,
        },
      })
    }

    return jsonOk({
      summary: {
        updated: updatedKeys.length,
      },
      results: {
        updatedKeys,
        statuses: await listManagedSecretStatuses(),
      },
    })
  } catch (error) {
    return jsonError(error, 500)
  }
}
