import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
import { jsonError, jsonOk } from "@/lib/core/http"
import {
  describePluggyWebhooks,
  reconcilePluggyWebhook,
} from "@/lib/ingestion/webhook-registry"

export const dynamic = "force-dynamic"

/** Estado atual: o que está registrado na Pluggy vs. o que deveria estar. */
export async function GET(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    return jsonOk({ results: await describePluggyWebhooks() })
  } catch (error) {
    return jsonError(error)
  }
}

/**
 * Reconcilia o registro do webhook na Pluggy. `force: true` apaga e recria —
 * necessário ao rotar o secret, porque a Pluggy não devolve os `headers`
 * gravados e não há como conferir se ainda são os nossos.
 */
export async function POST(request: Request) {
  const authError = ensureInternalApiKey(request)
  if (authError) return authError

  try {
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean
      pruneForeign?: boolean
    }

    const result = await reconcilePluggyWebhook({
      force: body.force === true,
      pruneForeign: body.pruneForeign,
    })

    return jsonOk({ results: result })
  } catch (error) {
    return jsonError(error, 400)
  }
}
