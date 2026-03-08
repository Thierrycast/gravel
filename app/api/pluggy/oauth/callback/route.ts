import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const itemId = searchParams.get("itemId")
  const error = searchParams.get("error")
  const message = searchParams.get("message")

  return NextResponse.json({
    status,
    itemId,
    error,
    message,
  })
}
