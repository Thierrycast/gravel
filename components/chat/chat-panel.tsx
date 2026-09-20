"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Send, ShieldCheck, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ChatVoice } from "./chat-voice"

export type ChatMessage = {
  id: string
  role: string
  content: string
  audit: {
    provider?: string
    model?: string
    rounds?: number
    redactions?: number
    calls?: number
    outboundBytes?: number
  } | null
  createdAt: string
}

type SpeechConfig = {
  configured: boolean
  baseUrl: string | null
  streamingUrl: string | null
  voice: string | null
}

/**
 * A conversa em si — usada tanto pelo dock do canto quanto pela página cheia.
 *
 * Um componente só porque duas cópias divergiriam no primeiro ajuste, e porque
 * o histórico é o mesmo dos dois lados: quem começa a conversa no popup abre
 * `/chat` e continua de onde parou.
 *
 * O que está aqui e não era óbvio:
 *
 * - **A resposta do POST é `{userMessage, assistantMessage}`**, não `{message}`.
 *   A primeira versão desta tela lia `data.message` e mostrava "Erro de
 *   resposta." em cima de toda resposta certa que o servidor mandou.
 * - **O erro do provedor aparece na tela.** `api_key_missing` e
 *   `provedor_falhou` dizem o que fazer; "Erro de conexão." não diz nada.
 * - **A linha de auditoria do guard fica visível.** Quantos dados foram
 *   redigidos antes de sair da casa é a informação que justifica confiar no
 *   chat; escondê-la seria esconder o principal.
 */
export function ChatPanel({
  variant = "page",
  className,
}: {
  variant?: "page" | "dock"
  className?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [speech, setSpeech] = useState<SpeechConfig | null>(null)
  const [speakLast, setSpeakLast] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [historyRes, voiceRes] = await Promise.all([
          fetch("/api/chat"),
          fetch("/api/chat/voice"),
        ])
        const history = await historyRes.json()
        const voice = await voiceRes.json()
        if (!alive) return
        setMessages(Array.isArray(history?.messages) ? history.messages : [])
        setSpeech(voice?.results ?? null)
      } catch {
        if (alive) setProblem("Não consegui carregar a conversa.")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || pending) return
      setDraft("")
      setProblem(null)
      setPending(true)

      // Otimista só na mensagem dele: a resposta real vem do servidor com id.
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        audit: null,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        })
        const data = await res.json()

        if (!res.ok) {
          setMessages((prev) => prev.filter((item) => item.id !== optimistic.id))
          setDraft(message)
          setProblem(describeError(data))
          return
        }

        setMessages((prev) => [
          ...prev.filter((item) => item.id !== optimistic.id),
          data.userMessage,
          data.assistantMessage,
        ])
        setSpeakLast(data.assistantMessage?.content ?? null)
      } catch {
        setMessages((prev) => prev.filter((item) => item.id !== optimistic.id))
        setDraft(message)
        setProblem("Não consegui falar com o servidor.")
      } finally {
        setPending(false)
      }
    },
    [pending],
  )

  async function clearConversation() {
    setProblem(null)
    try {
      await fetch("/api/chat", { method: "DELETE" })
      setMessages([])
    } catch {
      setProblem("Não consegui limpar a conversa.")
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4",
          variant === "dock" && "px-3",
        )}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando conversa…</p>
        ) : messages.length === 0 ? (
          <EmptyHint onPick={send} />
        ) : (
          messages.map((message) => <Bubble key={message.id} message={message} />)
        )}

        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Consultando seus dados…
          </div>
        )}

        {problem && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {problem}
          </p>
        )}
      </div>

      {speech?.configured && speech.baseUrl && (
        <ChatVoice
          baseUrl={speech.baseUrl}
          streamingUrl={speech.streamingUrl ?? ""}
          voice={speech.voice ?? ""}
          speakText={speakLast}
          onTranscript={send}
          compact={variant === "dock"}
        />
      )}

      <form
        className="flex items-end gap-2 border-t border-border/70 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Pergunte sobre gastos, faturas, limites…"
          rows={1}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send(draft)
            }
          }}
        />
        <Button type="submit" size="icon" className="size-11" disabled={!draft.trim() || pending}>
          <Send />
          <span className="sr-only">Enviar</span>
        </Button>
        {messages.length > 0 && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 text-muted-foreground"
            onClick={() => void clearConversation()}
          >
            <Trash2 />
            <span className="sr-only">Limpar conversa</span>
          </Button>
        )}
      </form>
    </div>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user"
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-1.5", mine && "text-right")}>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            mine
              ? "bg-primary text-primary-foreground"
              : "border border-border/70 bg-muted/50 text-foreground",
          )}
        >
          {message.content}
        </div>
        {message.audit && <AuditLine audit={message.audit} />}
      </div>
    </div>
  )
}

/**
 * O que saiu da casa nesta resposta. Sem isto, a promessa do guard é uma
 * afirmação; com isto, é um número na tela.
 */
function AuditLine({ audit }: { audit: NonNullable<ChatMessage["audit"]> }) {
  const parts = [
    audit.model,
    audit.calls ? `${audit.calls} chamada${audit.calls > 1 ? "s" : ""}` : null,
    typeof audit.outboundBytes === "number" ? `${formatBytes(audit.outboundBytes)} enviados` : null,
    audit.redactions ? `${audit.redactions} campo(s) redigido(s)` : "nada sensível saiu",
  ].filter(Boolean)

  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <ShieldCheck className="size-3" />
      {parts.join(" · ")}
    </p>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SUGGESTIONS = [
  "Quanto gastei este mês?",
  "Qual é o limite total dos meus cartões?",
  "Onde mais gastei nos últimos 30 dias?",
]

function EmptyHint({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-3 py-4">
      <p className="text-sm text-muted-foreground">
        Pergunte em português. Ele lê seus dados por ferramentas de leitura e nunca altera nada.
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

function describeError(data: unknown): string {
  const payload = (data ?? {}) as { error?: string; detalhe?: string; limite?: number }
  switch (payload.error) {
    case "api_key_missing":
      return "Falta a chave da IA. Cadastre em /settings → Chaves e credenciais."
    case "provedor_falhou":
      return `O provedor de IA recusou a chamada: ${payload.detalhe ?? "sem detalhe"}`
    case "mensagem_longa":
      return `Mensagem longa demais (limite de ${payload.limite ?? 4000} caracteres).`
    case "mensagem_vazia":
      return "Escreva alguma coisa antes de enviar."
    default:
      return "Não consegui responder agora."
  }
}
