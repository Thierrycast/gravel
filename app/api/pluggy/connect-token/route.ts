import { NextResponse } from "next/server"

import { createConnectToken } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const data = await createConnectToken()
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