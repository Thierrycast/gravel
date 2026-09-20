/**
 * Onde fica o speech-api (TTS/STT) que o chat usa para falar e ouvir.
 *
 * Resolvido em **runtime**, nunca embutido no bundle. Dois motivos, os dois já
 * custaram caro neste repo:
 *
 * 1. `NEXT_PUBLIC_*` é inlinado no `next build`. Foi exatamente assim que o Web
 *    Push ficou morto em silêncio em produção (ver `app/api/push/key/route.ts`):
 *    o build não tinha o valor, o cliente leu `undefined` e ninguém soube.
 * 2. O endereço do speech-api é infraestrutura pessoal dele. Este repo tem
 *    remote no GitHub — endereço de máquina da casa não entra em commit.
 *
 * Então o valor vem de `/settings` (ou de `SPEECH_API_BASE_URL` no compose) e é
 * servido ao browser por `/api/chat/voice`.
 */
import { prisma } from "@/lib/prisma"

export type SpeechConfig = {
  /** Sem barra no fim. Ex.: `http://<host-do-lab>:8010`. */
  baseUrl: string
  /** Derivado do baseUrl: http→ws, https→wss. */
  streamingUrl: string
  voice: string
}

/** Voz padrão do speech-api dele; trocável em /settings. */
const DEFAULT_VOICE = "piper:pt_BR-cadu-medium"

function normalize(raw: string): string {
  return raw.trim().replace(/\/+$/, "")
}

function toWebSocket(baseUrl: string): string {
  // `new URL` normaliza o host e evita concatenar string errada quando o
  // endereço vem com porta, caminho ou barra sobrando.
  const url = new URL(baseUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/stt/stream`
  return url.toString()
}

export async function resolveSpeechConfig(): Promise<SpeechConfig | null> {
  const settings = await prisma.userSetting.findUnique({ where: { id: "default" } })

  let saved: { baseUrl?: string; voice?: string } = {}
  try {
    saved = JSON.parse(settings?.dashboardConfigJson || "{}").speech || {}
  } catch {
    // Config corrompida cai no ambiente em vez de derrubar a rota.
  }

  const candidate = saved.baseUrl?.trim() || process.env.SPEECH_API_BASE_URL?.trim()
  if (!candidate) return null

  let baseUrl: string
  try {
    baseUrl = normalize(new URL(candidate).toString())
  } catch {
    return null
  }

  return {
    baseUrl,
    streamingUrl: toWebSocket(baseUrl),
    voice: saved.voice?.trim() || process.env.SPEECH_API_VOICE?.trim() || DEFAULT_VOICE,
  }
}
