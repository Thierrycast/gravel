import { jsonError, jsonOk } from "@/lib/core/http"
import { getVapidKeys } from "@/lib/domain/notifications"

export const dynamic = "force-dynamic"

/**
 * Chave VAPID **pública** para o browser assinar a inscrição de push.
 *
 * Existe porque a tela lia `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` num
 * componente cliente — valor embutido em tempo de build. O build nunca teve a
 * chave, então o push ficou silenciosamente morto em produção. Servindo em
 * runtime, cadastrar em /settings → Chaves e credenciais passa a bastar.
 *
 * Devolver esta chave é seguro: ela é pública por definição do protocolo. A
 * privada nunca sai do servidor.
 */
export async function GET() {
  try {
    const { publicKey } = await getVapidKeys()
    return jsonOk({
      results: { publicKey, configured: Boolean(publicKey) },
    })
  } catch (error) {
    return jsonError(error)
  }
}
