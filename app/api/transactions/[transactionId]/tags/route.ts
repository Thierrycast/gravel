import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"
import { NextRequest } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params

    const transactionTags = await prisma.transactionTag.findMany({
      where: { domainTransactionId: transactionId },
    })

    const tagIds = transactionTags.map((tt) => tt.tagId)

    const tags = tagIds.length
      ? await prisma.tag.findMany({ where: { id: { in: tagIds } } })
      : []

    return jsonOk({ results: tags })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params
    const body = await request.json()
    const { tagId } = body

    if (!tagId) {
      return jsonError(new Error("tagId é obrigatório"), 400)
    }

    const transactionTag = await prisma.transactionTag.create({
      data: {
        domainTransactionId: transactionId,
        tagId,
      },
    })

    return jsonOk({ results: transactionTag })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return jsonError(new Error("Tag já associada a esta transação"), 409)
    }
    return jsonError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params
    const body = await request.json()
    const { tagId } = body

    if (!tagId) {
      return jsonError(new Error("tagId é obrigatório"), 400)
    }

    await prisma.transactionTag.deleteMany({
      where: {
        domainTransactionId: transactionId,
        tagId,
      },
    })

    return jsonOk({ results: null })
  } catch (error) {
    return jsonError(error)
  }
}
