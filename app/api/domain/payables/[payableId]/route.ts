import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/core/http"
import { validationError } from "@/lib/core/money"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

type RouteParams = { params: Promise<{ payableId: string }> }

const updatePayableSchema = z
  .object({
    description: z.string().trim().min(1).max(120).optional(),
    // PAID manual cobre o boleto pago por fora (dinheiro, conta não conectada).
    status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nada para atualizar")

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { payableId } = await params
    const parsed = updatePayableSchema.safeParse(await request.json())
    if (!parsed.success) return jsonError(validationError(parsed.error), 400)

    const existing = await prisma.payable.findUnique({ where: { id: payableId }, select: { id: true } })
    if (!existing) return jsonError(new Error("Conta não encontrada"), 404)

    const { status, description } = parsed.data
    const payable = await prisma.payable.update({
      where: { id: payableId },
      data: {
        ...(description ? { description } : {}),
        ...(status
          ? {
              status,
              // Voltar para pendente desfaz a ligação; marcar paga à mão não inventa transação.
              paidAt: status === "PAID" ? new Date() : null,
              paidTransactionId: null,
            }
          : {}),
      },
    })
    return jsonOk({ results: payable })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { payableId } = await params
    const existing = await prisma.payable.findUnique({ where: { id: payableId }, select: { id: true } })
    if (!existing) return jsonError(new Error("Conta não encontrada"), 404)
    await prisma.payable.delete({ where: { id: payableId } })
    return jsonOk({ results: { id: payableId, deleted: true } })
  } catch (error) {
    return jsonError(error)
  }
}
