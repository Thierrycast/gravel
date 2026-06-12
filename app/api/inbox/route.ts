import { jsonError, jsonOk } from "@/lib/core/http"
import { getInboxPayload, setInboxItemStatus } from "@/lib/domain/review"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const payload = await getInboxPayload()
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: string; status?: "open" | "resolved" | "ignored" }
      | null

    if (!body?.id || !body.status) {
      return jsonError(new Error("id e status sao obrigatorios."), 400)
    }

    if (!["open", "resolved", "ignored"].includes(body.status)) {
      return jsonError(new Error("Status invalido."), 400)
    }

    await setInboxItemStatus(body.id, body.status)
    const payload = await getInboxPayload()
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}
