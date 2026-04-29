import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"

export async function GET() {
  const scenarios = await prisma.domainScenarioEvent.findMany({
    orderBy: { date: "asc" }
  })
  return NextResponse.json(serializeForJson(scenarios))
}

export async function POST(request: Request) {
  const body = await request.json()
  const scenario = await prisma.domainScenarioEvent.create({
    data: {
      title: body.title,
      amount: body.amount,
      date: new Date(body.date),
      isRecurring: body.isRecurring || false,
      frequency: body.frequency,
      categoryId: body.categoryId,
    }
  })
  return NextResponse.json(serializeForJson(scenario))
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 })
  await prisma.domainScenarioEvent.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
