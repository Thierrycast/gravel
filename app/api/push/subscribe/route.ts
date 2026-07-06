import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json() as { endpoint?: string; p256dh?: string; auth?: string }
  const { endpoint, p256dh, auth } = body

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth },
    create: { endpoint, p256dh, auth },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const body = await request.json() as { endpoint?: string }
  const { endpoint } = body

  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 })
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint } })

  return NextResponse.json({ ok: true })
}
