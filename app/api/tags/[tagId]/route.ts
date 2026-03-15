import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"
import { NextRequest } from "next/server"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const { tagId } = await params
    const body = await request.json()
    const { name, color } = body

    const tag = await prisma.tag.update({
      where: { id: tagId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
      },
    })

    return jsonOk({ results: tag })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const { tagId } = await params

    await prisma.$transaction([
      prisma.transactionTag.deleteMany({ where: { tagId } }),
      prisma.tag.delete({ where: { id: tagId } }),
    ])

    return jsonOk({ results: null })
  } catch (error) {
    return jsonError(error)
  }
}
