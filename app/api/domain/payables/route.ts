import { z } from "zod"

import { jsonError, jsonOk } from "@/lib/core/http"
import { validationError } from "@/lib/core/money"
import { PayableInputError, createPayable, listPayables } from "@/lib/domain/payables"

export const dynamic = "force-dynamic"

const createPayableSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do boleto"),
  description: z.string().trim().min(1, "Dê um nome para a conta").max(120),
  dueDate: z.string().trim().nullish(),
  amount: z.number().positive().nullish(),
})

export async function GET() {
  try {
    const payload = await listPayables()
    return jsonOk({ summary: payload.summary, results: payload.results })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createPayableSchema.safeParse(await request.json())
    if (!parsed.success) return jsonError(validationError(parsed.error), 400)
    const payable = await createPayable(parsed.data)
    return jsonOk({ results: payable })
  } catch (error) {
    return jsonError(error, error instanceof PayableInputError ? 422 : 500)
  }
}
