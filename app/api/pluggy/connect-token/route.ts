import { NextResponse } from "next/server"

import {
  createConnectToken,
  getPluggyErrorDetails,
} from "@/lib/integrations/pluggy"
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
    const details = getPluggyErrorDetails(error)

    if (details.retryable) {
      console.error("[pluggy/connect-token]", error)
    } else {
      console.warn(`[pluggy/connect-token] ${details.code}: ${details.message}`)
    }

    return NextResponse.json(
      {
        error: "Pluggy Widget Init Failed",
        details: details.message,
        code: details.code,
        actionPath: details.actionPath,
        retryable: details.retryable,
      },
      { status: details.statusCode }
    )
  }
}
