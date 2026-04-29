import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import { rebuildInstallmentGroups } from "@/lib/domain/installments"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const summary = await rebuildInstallmentGroups()
    return jsonOk({ summary, results: summary })
  } catch (error) {
    return jsonError(error)
  }
}
