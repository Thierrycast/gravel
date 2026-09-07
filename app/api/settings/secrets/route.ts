import { jsonError, jsonOk } from "@/lib/core/http"
import { clearPluggyApiKeyCache } from "@/lib/integrations/pluggy"
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

/**
 * Status de cada credencial: onde está (banco, ambiente ou não definida) e se dá
 * para persistir. **Nunca devolve valor** — só se existe e de onde vem.
 */
export async function GET() {
  try {
    const settings = await prisma.userSetting.findFirst({
      select: { vaultMasterPassword: true },
    })
    return jsonOk({
      results: {
        secrets: await listManagedSecretStatuses(),
        canPersist: canPersistSecretsToDatabase(),
        // Quando não há senha definida, o primeiro cadastro é liberado — senão
        // seria impossível começar (o cadastro exigiria uma senha que só pode ser
        // criada... na mesma tela).
        requiresMasterPassword: Boolean(settings?.vaultMasterPassword),
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SecretsPayload
    const settings = await prisma.userSetting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })

    // Sem senha definida ainda: libera o primeiro cadastro. Exigir senha aqui
    // tornaria o setup impossível — e não há nada a proteger antes da primeira
    // credencial existir.
    if (settings.vaultMasterPassword) {
      const verification = await verifyMasterPassword(
        body.masterPassword ?? "",
        settings.vaultMasterPassword
      )

      if (!verification.valid) {
        return jsonError(new Error("Senha incorreta."), 401)
      }

      // Senha ainda em texto de uma versão antiga: aproveita a verificação para
      // gravar o hash scrypt.
      if (verification.migratedHash) {
        await prisma.userSetting.update({
          where: { id: "default" },
          data: { vaultMasterPassword: verification.migratedHash },
        })
      }
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

    if (
      updatedKeys.includes("PLUGGY_CLIENT_ID") ||
      updatedKeys.includes("PLUGGY_CLIENT_SECRET")
    ) {
      // Uma API key obtida com as credenciais anteriores pode durar duas horas.
      // A próxima chamada precisa validar imediatamente o valor salvo na tela.
      clearPluggyApiKeyCache()
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
