"use client"

import { WifiOff, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <WifiOff className="size-8 text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Você está offline</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sem conexão com a internet no momento.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border bg-card p-4 text-left text-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          O que funciona offline
        </p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="text-foreground">Páginas já visitadas (cache)</span>
          </li>
          <li className="flex items-center gap-2 text-red-400">
            <XCircle className="size-4 shrink-0" />
            <span className="text-foreground">Sincronização com bancos</span>
          </li>
          <li className="flex items-center gap-2 text-red-400">
            <XCircle className="size-4 shrink-0" />
            <span className="text-foreground">Busca de dados e cotações</span>
          </li>
          <li className="flex items-center gap-2 text-red-400">
            <XCircle className="size-4 shrink-0" />
            <span className="text-foreground">Gráficos e relatórios novos</span>
          </li>
        </ul>
      </div>

      <Button
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload()
        }}
      >
        Tentar novamente
      </Button>
    </div>
  )
}
