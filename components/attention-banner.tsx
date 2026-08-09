"use client"

import type { LucideIcon } from "lucide-react"
import { AlertTriangle, X } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Faixa de aviso no topo do conteúdo.
 *
 * Existe porque havia dois componentes de banner com marcação própria para o
 * mesmo trabalho (falha de sync e conexão precisando de atenção), cada um com
 * seu espaçamento, seu tom e seu jeito de encaixar ação e dispensar. Vocabulário
 * inconsistente para o mesmo conceito é drift; aqui os dois passam pela mesma
 * forma.
 *
 * Título e detalhe são linhas separadas de propósito: antes tudo era uma linha
 * só — rótulo em negrito, parêntese com provedor e horário, mensagem de erro
 * cortada em 120 caracteres e um botão — que quebrava mal em qualquer largura.
 */
export function AttentionBanner({
  tone = "warning",
  icon: Icon = AlertTriangle,
  title,
  detail,
  action,
  onDismiss,
  className,
}: {
  tone?: "warning" | "critical"
  icon?: LucideIcon
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        // Sem `mx-auto max-w-4xl`: os banners se centralizavam dentro de um
        // container bem mais largo e ficavam desalinhados do título da página.
        "flex w-full flex-col gap-2 border px-3 py-2.5 text-sm sm:flex-row sm:items-start sm:gap-3",
        tone === "critical"
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "critical" ? "text-destructive" : "text-amber-500",
        )}
        aria-hidden
      />

      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium leading-snug text-foreground">{title}</p>
        {detail ? (
          // `text-muted-foreground` e não uma cor esmaecida arbitrária: o token
          // é o único que garante contraste nos dois temas.
          <div className="space-y-0.5 text-xs leading-relaxed text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1 self-start">
        {action}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dispensar aviso"
            // 44px de alvo em toque, mantendo o desenho compacto no desktop.
            className="-m-2 p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
