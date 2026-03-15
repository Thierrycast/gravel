import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { description, amount, direction, occurredAt, domainAccountId, domainCategoryId } = body

    if (!description || typeof description !== "string" || !description.trim()) {
      return jsonError(new Error("Descrição é obrigatória"), 400)
    }

    if (amount == null || typeof amount !== "number" || amount <= 0) {
      return jsonError(new Error("Valor deve ser um número positivo"), 400)
    }

    const validDirections = ["INFLOW", "OUTFLOW"] as const
    if (!direction || !validDirections.includes(direction)) {
      return jsonError(
        new Error("Direção deve ser INFLOW ou OUTFLOW"),
        400
      )
    }

    let parsedDate: Date
    if (occurredAt) {
      parsedDate = new Date(occurredAt)
      if (isNaN(parsedDate.getTime())) {
        return jsonError(new Error("Data inválida"), 400)
      }
    } else {
      parsedDate = new Date()
    }

    const sourceExternalId = `manual-${crypto.randomUUID()}`

    const transaction = await prisma.domainTransaction.create({
      data: {
        occurredAt: parsedDate,
        description: description.trim(),
        normalizedDescription: description.trim().toLowerCase(),
        amount,
        currencyCode: "BRL",
        direction,
        sourceProvider: "MANUAL",
        sourceExternalId,
        domainAccountId: domainAccountId || null,
        domainCategoryId: domainCategoryId || null,
      },
    })

    return jsonOk({
      results: transaction,
    })
  } catch (error) {
    return jsonError(error)
  }
}
