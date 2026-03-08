import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/binance-route-helpers"
import { updateOwnedAssetPrices } from "@/lib/binance-sync"

export const dynamic = "force-dynamic"

async function handle() {
  try {
    const result = await updateOwnedAssetPrices()
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET() {
  return handle()
}

export async function POST() {
  return handle()
}
