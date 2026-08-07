import {
  getRecentSyncEvents,
  subscribeSyncEvents,
  type SyncEvent,
} from "@/lib/sync-events"

export const dynamic = "force-dynamic"

/** Heartbeat abaixo do timeout de proxy padrão para a conexão não cair calada. */
const HEARTBEAT_MS = 25_000

/**
 * Stream SSE dos eventos de sincronização. Substitui o polling de 5s do botão
 * de sync: quando o webhook da Pluggy traz dado novo, o browser sabe na hora,
 * mesmo que o sync tenha começado no servidor sem o usuário pedir.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false

      const send = (event: SyncEvent | { type: "ping"; at: string }) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Cliente já foi embora; o cleanup abaixo resolve.
          cleanup()
        }
      }

      // Reconexão não pode começar cega: manda o que aconteceu há pouco. O
      // cliente descarta pelo `at` o que já viu.
      for (const event of getRecentSyncEvents().slice(-5)) {
        send(event)
      }

      const unsubscribe = subscribeSyncEvents(send)

      const heartbeat = setInterval(() => {
        send({ type: "ping", at: new Date().toISOString() })
      }, HEARTBEAT_MS)

      function cleanup() {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Já fechado.
        }
      }

      request.signal.addEventListener("abort", cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Evita buffering em proxy reverso (o Traefik do lab fica na frente).
      "X-Accel-Buffering": "no",
    },
  })
}
