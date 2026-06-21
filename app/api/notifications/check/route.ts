import { NextResponse } from "next/server"
import { checkBudgetAnomalies } from "@/lib/domain/notifications"
import { serializeForJson } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const anomalies = await checkBudgetAnomalies()
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      count: anomalies.length,
      anomalies: serializeForJson(anomalies),
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno ao checar anomalias de orcamento",
      },
      { status: 500 }
    )
  }
}
