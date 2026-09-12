import type { Metadata } from "next"

import { ChatPanel } from "@/components/chat/chat-panel"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = {
  title: "Assistente · Gravel",
}

/**
 * O mesmo chat do dock, em tela cheia. Mesma conversa dos dois lados: o
 * histórico vive no banco (`AiChatMessage`), não no estado do componente.
 */
export default function ChatPage() {
  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col gap-4">
      <PageHeader
        title="Assistente"
        description="Pergunta em português sobre contas, gastos, faturas e limites. Só leitura: ele consulta seus dados por ferramentas e não altera nada."
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
        <ChatPanel variant="page" />
      </div>
    </div>
  )
}
