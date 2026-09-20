import { z } from "zod"

import { isoDate, positiveMoney, requiredText, toMoneyDecimal, validationError } from "@/lib/core/money"
import { jsonOk, jsonError } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * A validação era manual: uma escada de `typeof`, `.trim()` e
 * `isNaN(Date.getTime())`, repetida com pequenas variações em outras rotas. O
 * schema substitui a escada e, mais importante, arredonda o valor para centavo
 * antes de encostar no banco — era por aqui que float sujo virava `Decimal`
 * sujo (ver lib/core/money.ts).
 */
const createTransactionSchema = z.object({
  description: requiredText("Descrição"),
  amount: positiveMoney,
  direction: z.enum(["INFLOW", "OUTFLOW"], {
    message: "Direção deve ser INFLOW ou OUTFLOW",
  }),
  occurredAt: isoDate.optional(),
  domainAccountId: z.string().trim().min(1).nullish(),
  domainCategoryId: z.string().trim().min(1).nullish(),
})

export async function POST(request: Request) {
  try {
    const parsed = createTransactionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return jsonError(validationError(parsed.error), 400)
    }

    const { description, amount, direction, occurredAt, domainAccountId, domainCategoryId } =
      parsed.data

    const transaction = await prisma.domainTransaction.create({
      data: {
        occurredAt: occurredAt ?? new Date(),
        description,
        normalizedDescription: description.toLowerCase(),
        amount: toMoneyDecimal(amount),
        currencyCode: "BRL",
        direction,
        sourceProvider: "MANUAL",
        sourceExternalId: `manual-${crypto.randomUUID()}`,
        domainAccountId: domainAccountId ?? null,
        domainCategoryId: domainCategoryId ?? null,
      },
    })

    return jsonOk({ results: transaction })
  } catch (error) {
    return jsonError(error)
  }
}
