import { prisma } from "@/lib/prisma"
import { jsonOk, jsonError } from "@/lib/core/http"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params

    const transaction = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!transaction) {
      return jsonError(new Error("Transação não encontrada"), 404)
    }

    return jsonOk({
      results: transaction,
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params
    const body = await request.json()

    const existing = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!existing) {
      return jsonError(new Error("Transação não encontrada"), 404)
    }

    const allowedFields = ["domainCategoryId", "description", "ignored"] as const
    const updateData: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(
        new Error("Nenhum campo válido para atualização. Campos permitidos: domainCategoryId, description, ignored"),
        400
      )
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.domainTransaction.update({
        where: { id: transactionId },
        data: updateData,
      })

      if ("ignored" in updateData) {
        if (updateData.ignored === true) {
          await tx.ignoredTransaction.upsert({
            where: { domainTransactionId: transactionId },
            create: {
              domainTransactionId: transactionId,
              reason: body.ignoreReason ?? null,
            },
            update: {
              reason: body.ignoreReason ?? null,
            },
          })
        } else {
          await tx.ignoredTransaction.deleteMany({
            where: { domainTransactionId: transactionId },
          })
        }
      }

      return updated
    })

    return jsonOk({
      results: transaction,
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    const { transactionId } = await params

    const existing = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    })

    if (!existing) {
      return jsonError(new Error("Transação não encontrada"), 404)
    }

    if (existing.sourceProvider !== "MANUAL") {
      return jsonError(
        new Error(
          "Apenas transações manuais podem ser excluídas por este endpoint. Transações sincronizadas de provedores externos devem ser mantidas."
        ),
        400
      )
    }

    await prisma.$transaction(async (tx) => {
      // Limpar tabelas associadas (se houver registros)
      await tx.ignoredTransaction.deleteMany({
        where: { domainTransactionId: transactionId },
      })

      await tx.domainTransactionSource.deleteMany({
        where: { domainTransactionId: transactionId },
      })

      await tx.transactionTag.deleteMany({
        where: { domainTransactionId: transactionId },
      })

      // Excluir a transação propriamente dita
      await tx.domainTransaction.delete({
        where: { id: transactionId },
      })
    })

    return jsonOk({
      results: {
        id: transactionId,
        message: "Transação excluída com sucesso",
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
