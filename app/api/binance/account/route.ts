import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/binance-route-helpers"
import { fetchSpotAccount } from "@/lib/integrations/binance"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const account = await fetchSpotAccount()
    return NextResponse.json(account)
  } catch (error) {
    return errorResponse(error)
  }
}
