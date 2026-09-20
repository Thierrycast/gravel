import { jsonError, jsonOk } from "@/lib/core/http"
import { resolveSpeechConfig } from "@/lib/ai/speech"

export const dynamic = "force-dynamic"

/**
 * Configuração pública da voz. O endereço real do speech-api fica no servidor;
 * o browser usa o proxy same-origin em `/api/chat/voice/*`.
 *
 * Quando não está configurado, `configured: false` — e o chat continua
 * funcionando por texto, sem botão de microfone morto na tela.
 */
export async function GET() {
  try {
    const config = await resolveSpeechConfig()
    return jsonOk({
      results: config
        ? {
            configured: true,
            baseUrl: "/api/chat/voice",
            streamingUrl: "",
            voice: config.voice,
          }
        : { configured: false, baseUrl: null, streamingUrl: null, voice: null },
    })
  } catch (error) {
    return jsonError(error)
  }
}
