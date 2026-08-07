import { NextResponse } from "next/server"

import { createConnectToken } from "@/lib/integrations/pluggy"
import { getWebhookUrl } from "@/lib/ingestion/webhook-registry"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    // Amarra o webhook ao token: itens criados por este widget notificam desde
    // o primeiro sync, sem depender só do webhook global da aplicação.
    const data = await createConnectToken({
      webhookUrl: getWebhookUrl() ?? undefined,
    })
    const accessToken =
      data?.accessToken ?? data?.connectToken ?? data?.token ?? data

    return NextResponse.json({ accessToken })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao gerar o token de conexao do Pluggy"

    console.error("[pluggy/connect-token]", error)

    return NextResponse.json(
      {
        error: "Pluggy Widget Init Failed",
        details: message,
      },
      { status: 500 }
    )
  }
}