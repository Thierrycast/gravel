import { jsonError, jsonOk } from "@/lib/core/http"
import { getDomainGoals } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const payload = await getDomainGoals(searchParams)
    return jsonOk(payload)
  } catch (error) {
    return jsonError(error)
  }
}
