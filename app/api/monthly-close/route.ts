import { jsonError, jsonOk } from "@/lib/core/http"
import {
  completeMonthlyClose,
  currentMonthKey,
  getMonthlyClosePayload,
  setMonthlyCloseStep,
} from "@/lib/domain/review"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") ?? currentMonthKey()
    const payload = await getMonthlyClosePayload(month)
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { month?: string; stepId?: string; completed?: boolean }
      | null

    if (!body?.stepId) {
      return jsonError(new Error("stepId e obrigatorio."), 400)
    }

    const month = body.month ?? currentMonthKey()
    await setMonthlyCloseStep(month, body.stepId, body.completed !== false)
    const payload = await getMonthlyClosePayload(month)
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { month?: string }
      | null
    const month = body?.month ?? currentMonthKey()
    const payload = await getMonthlyClosePayload(month)
    await completeMonthlyClose(month, payload.summary as Record<string, unknown>)
    return jsonOk(await getMonthlyClosePayload(month))
  } catch (error) {
    return jsonError(error)
  }
}
