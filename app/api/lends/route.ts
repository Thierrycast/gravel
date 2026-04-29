import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeForJson } from "@/lib/core/http"

export async function GET() {
  const lends = await prisma.domainLend.findMany({
    orderBy: { dueDate: "asc" }
  })
  return NextResponse.json(serializeForJson(lends))
}

export async function POST(request: Request) {
  const body = await request.json()
  const lend = await prisma.domainLend.create({
    data: {
      friendName: body.friendName,
      friendPhone: body.friendPhone,
      amount: body.amount,
      dueDate: new Date(body.dueDate),
      description: body.description,
      categoryId: body.categoryId,
      domainBillId: body.domainBillId,
      status: "PENDING",
    }
  })
  return NextResponse.json(serializeForJson(lend))
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const lend = await prisma.domainLend.update({
    where: { id: body.id },
    data: {
      status: body.status,
      amount: body.amount,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    }
  })
  return NextResponse.json(serializeForJson(lend))
}
