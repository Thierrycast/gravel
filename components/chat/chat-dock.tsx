"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Maximize2, MessageSquare, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ChatPanel } from "./chat-panel"

/**
 * O chat no canto inferior direito, sobre qualquer tela do app.
 *
 * Três decisões que valem registro:
 *
 * - **O painel só monta quando abre.** Montado sempre, ele carregaria o
 *   histórico e o motor de áudio em toda navegação do app, por nada.
 * - **Some em `/chat`.** Ter o popup por cima da versão em tela cheia é o
 *   mesmo chat duas vezes, com dois estados de rascunho.
 * - **Fica acima da bottom-nav no celular** (`bottom-24`), senão o botão nasce
 *   escondido atrás dela.
 */
export function ChatDock() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (pathname?.startsWith("/chat")) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-24 z-60 flex flex-col items-end gap-3 md:bottom-6">
      {open && (
        <section
          aria-label="Assistente do Gravel"
          className={cn(
            "pointer-events-auto flex h-[min(32rem,70dvh)] w-[min(24rem,calc(100vw-2rem))] flex-col",
            "overflow-hidden rounded-xl border border-border/70 bg-background shadow-2xl",
          )}
        >
          <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Assistente</span>
            <div className="ml-auto flex items-center gap-1">
              <Button asChild size="icon" variant="ghost" className="size-8 text-muted-foreground">
                <Link href="/chat" aria-label="Abrir em tela cheia">
                  <Maximize2 />
                </Link>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground"
                onClick={() => setOpen(false)}
                aria-label="Fechar assistente"
              >
                <X />
              </Button>
            </div>
          </header>
          <ChatPanel variant="dock" />
        </section>
      )}

      <Button
        size="icon"
        className="pointer-events-auto size-12 rounded-full shadow-lg"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      >
        {open ? <X /> : <MessageSquare />}
      </Button>
    </div>
  )
}
