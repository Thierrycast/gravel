import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncPluggyData } from "@/lib/pluggy-sync"
import { syncBinanceData } from "@/lib/binance-sync"
import { projectPluggyReadModels, projectBinanceReadModels, rebuildAllDomainReadModels } from "@/lib/domain/projectors"
import { refreshDerivedCaches } from "@/lib/domain/derived"

export const dynamic = "force-dynamic"

export async function GET() {
  const results: any = {}
  
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
  } catch (error: any) {
    console.error("SuperSync Error:", error)
    return NextResponse.json({ status: "error", message: error.message, stack: error.stack }, { status: 500 })
  }
}
