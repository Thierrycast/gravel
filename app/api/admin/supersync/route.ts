import { NextResponse } from "next/server"
import { syncPluggyData } from "@/lib/pluggy-sync"
import { syncBinanceData } from "@/lib/binance-sync"
import { projectPluggyReadModels, projectBinanceReadModels, rebuildAllDomainReadModels } from "@/lib/domain/projectors"
import { refreshDerivedCaches } from "@/lib/domain/derived"

export const dynamic = "force-dynamic"

interface SuperSyncResults {
  pluggy?: unknown
  binance?: unknown
  rebuilt?: unknown
  derived?: unknown
}

export async function GET() {
  const results: SuperSyncResults = {}

  try {
    console.log("SuperSync: Iniciando Pluggy...")
    results.pluggy = await syncPluggyData()
    await projectPluggyReadModels()

    console.log("SuperSync: Iniciando Binance...")
    results.binance = await syncBinanceData()
    await projectBinanceReadModels()

    console.log("SuperSync: Reconstruindo domínios...")
    results.rebuilt = await rebuildAllDomainReadModels()

    console.log("SuperSync: Atualizando caches...")
    results.derived = await refreshDerivedCaches()

    return NextResponse.json({ status: "success", results })
  } catch (error) {
    console.error("SuperSync Error:", error)
    const err = error as Error
    return NextResponse.json(
      { status: "error", message: err.message, stack: err.stack },
      { status: 500 }
    )
  }
}