import { jsonError, jsonOk } from "@/lib/core/http"
import { getDomainGoals } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const payload = await getDomainGoals()
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}
