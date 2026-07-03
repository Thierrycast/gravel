import { jsonError, jsonOk } from "@/lib/core/http"
import { refreshDomainAccountBalance } from "@/lib/pluggy-balance"

export const dynamic = "force-dynamic"

/**
 * POST /api/domain/accounts/{accountId}/balance
 * Atualiza apenas o saldo da conta em tempo real (GET /accounts/{id}/balance na
 * Pluggy), sem sync completo. Sempre responde 200: em falha, devolve o saldo
 * salvo com `ok:false` e a razão, para a UI fazer fallback elegante.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await context.params
    if (!accountId) {
      return jsonError(new Error("accountId obrigatório"), 400)
    }
    const result = await refreshDomainAccountBalance(accountId)
    return jsonOk({ results: result })
  } catch (error) {
    return jsonError(error)
  }
}
