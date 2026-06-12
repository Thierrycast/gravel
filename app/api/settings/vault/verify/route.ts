import { prisma } from "@/lib/prisma"
import { jsonError, jsonOk } from "@/lib/core/http"
import { verifyMasterPassword } from "@/lib/server/secret-store"

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { password?: string }
    const password = body.password ?? ""

    const settings = await prisma.userSetting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })

    const verification = await verifyMasterPassword(
      password,
      settings.vaultMasterPassword
    )

    if (!verification.valid) {
      return jsonError(new Error("Senha mestre incorreta."), 401)
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
      results: {
        ok: true,
      },
    })
  } catch (error) {
    return jsonError(error, 500)
  }
}
