import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { asset, averageCost } = body

    if (!asset || averageCost == null) {
      return NextResponse.json(
        { error: "Asset and averageCost are required" },
        { status: 400 }
      )
    }

    const cost = new Prisma.Decimal(averageCost)

    const updated = await prisma.domainCryptoAsset.update({
      where: { asset },
      data: {
        costBasis: cost,
      },
    })

    // Reprocess metadata to reflect the manual change if needed
    // In a real app we might want to recalculate PnL immediately
    // but the next sync/projection will do it anyway.
    
    return NextResponse.json({ success: true, asset: updated.asset })
  } catch (error) {
    console.error("Error updating cost basis:", error)
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
