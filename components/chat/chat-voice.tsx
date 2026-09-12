"use client"

import { useEffect, useRef } from "react"
import { Mic, MicOff, Square } from "lucide-react"
import { useVoiceSession, VoiceStage, setVoicePalette } from "voice-kit"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

setVoicePalette({
  listening: [0.2, 0.58, 1.0],
  speaking: [1.0, 0.84, 0.0],
  thinking: [0.6, 0.38, 0.94],
})

/**
 * A camada de voz do chat, isolada num componente próprio de propósito.
 *
 * `useVoiceSession` cria `AudioContext` e segura microfone. Montá-lo junto do
 * painel faria toda tela com chat carregar o motor de áudio mesmo para quem
 * nunca vai falar — e, sem o speech-api configurado, faria isso para apontar
 * para lugar nenhum. Por isso o painel só renderiza este componente quando
 * `/api/chat/voice` diz que existe endereço.
 *
 * O microfone só abre no clique. A `Permissions-Policy` do app libera
 * `microphone=(self)`; antes ela era `microphone=()`, o que bloqueava
 * `getUserMedia` na origem inteira e deixaria o botão sem efeito nenhum.
 */
export function ChatVoice({
  baseUrl,
  streamingUrl,
  voice,
  speakText,
  onTranscript,
  compact = false,
}: {
  baseUrl: string
  streamingUrl?: string
  voice: string
  /** Última resposta do assistente; é falada quando muda. */
  speakText: string | null
  onTranscript: (text: string) => void
  compact?: boolean
}) {
  const session = useVoiceSession({
    endpoint: { baseUrl, apiKey: "" },
    streamingUrl: streamingUrl || undefined,
    models: { transcription: "whisper", speech: "tts-1" },
    voice,
    language: "pt",
    onTranscript: (text) => {
      if (text.trim()) onTranscript(text)
    },
  })

  // Falar só o que ainda não foi falado: sem este guarda, qualquer re-render do
  // painel repetiria a última resposta em voz alta.
  const spokenRef = useRef<string | null>(null)
  useEffect(() => {
    if (!speakText || spokenRef.current === speakText) return
    spokenRef.current = speakText
    if (session.open) void session.speak(speakText)
  }, [speakText, session])

  return (
    <div className={cn("border-t border-border/70 px-3 py-2", compact && "px-2")}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={session.open ? "destructive" : "outline"}
          onClick={() => (session.open ? session.stop() : void session.start())}
        >
          {session.open ? <Square /> : <Mic />}
          {session.open ? "Encerrar voz" : "Falar"}
        </Button>

        {session.open && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={session.toggleMute}
            className="text-muted-foreground"
          >
            {session.muted ? <MicOff /> : <Mic />}
            {session.muted ? "Mudo" : "Ouvindo"}
          </Button>
        )}

        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" role={session.error ? "alert" : "status"}>
          {session.error ?? session.partial ?? (session.open ? "Pode falar" : "")}
        </span>
      </div>

      {session.open && (
        <VoiceStage
          state={session.state}
          metricsRef={session.metricsRef}
          visual="particle-orb"
          focused={session.open}
          transcript={session.partial}
          muted={session.muted}
          onToggleFocus={() => session.stop()}
          onToggleMute={session.toggleMute}
          onClose={session.stop}
        />
      )}
    </div>
  )
}
