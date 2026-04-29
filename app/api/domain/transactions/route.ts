import { jsonError, jsonOk } from "@/lib/core/http"
import { getDashboardTransactions } from "@/lib/domain/queries"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    return jsonOk(await getDashboardTransactions(searchParams))
  } catch (error) {
    return jsonError(error)
  }
}
