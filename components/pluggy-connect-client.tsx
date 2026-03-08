"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type PluggySuccessPayload = {
  item?: {
    id?: string
    status?: string
    connector?: {
      id?: number
      name?: string
    }
  }
}

type PluggyErrorPayload = {
  message?: string
  code?: string
}

type PluggyConnectHandle = {
  show: () => void
  hide: () => void
}

type StoredItem = {
  id: string
  pluggyItemId: string
  connectorName: string | null
  status: string | null
  isSelected: boolean
}

const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((mod) => mod.PluggyConnect),
  { ssr: false }
)

function getStatusTone(status: string | null) {
  switch (status) {
    case "UPDATED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
    case "UPDATING":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700"
    case "OUTDATED":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700"
    case "LOGIN_ERROR":
      return "border-red-500/30 bg-red-500/10 text-red-700"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

export function PluggyConnectClient() {
  const widgetRef = useRef<PluggyConnectHandle | null>(null)

  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState("Carregando token do Pluggy...")
  const [items, setItems] = useState<StoredItem[]>([])
  const [isOpening, setIsOpening] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function loadItems(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setIsRefreshing(true)
    }

    try {
      const response = await fetch("/api/pluggy/items", { cache: "no-store" })
      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
    } finally {
      if (!options?.silent) {
        setIsRefreshing(false)
      }
    }
  }

  async function selectItem(item: StoredItem) {
    setStatus(`Selecionando item ${item.pluggyItemId}...`)

    await fetch("/api/pluggy/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: item.pluggyItemId,
        connectorName: item.connectorName,
        status: item.status,
      }),
    })

    await loadItems()
    setStatus(`Item selecionado: ${item.pluggyItemId}`)
  }

  useEffect(() => {
    async function load() {
      try {
        const tokenResponse = await fetch("/api/pluggy/connect-token", {
          method: "POST",
        })
        const tokenData = await tokenResponse.json()

        if (!tokenData?.accessToken) {
          throw new Error("Token invalido")
        }

        setToken(tokenData.accessToken)
        setStatus("Pronto para conectar")
      } catch {
        setStatus("Falha ao inicializar o widget")
      }
    }

    void load()
    void loadItems()
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadItems({ silent: true })
    }, 10000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  async function handleSuccess(payload: PluggySuccessPayload) {
    const itemId = payload.item?.id

    if (!itemId) {
      setStatus("Conexao concluida, mas sem itemId")
      return
    }

    await fetch("/api/pluggy/items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId,
        connectorId: payload.item?.connector?.id,
        connectorName: payload.item?.connector?.name,
        status: payload.item?.status,
      }),
    })

    await loadItems()
    setStatus(`Conectado com sucesso: ${itemId}`)
    setIsOpening(false)
  }

  function handleError(error: PluggyErrorPayload) {
    const suffix = error.code ? ` (${error.code})` : ""
    setStatus(`Erro no widget: ${error.message ?? "falha ao conectar"}${suffix}`)
    setIsOpening(false)
  }

  function handleOpenWidget() {
    if (!token || !widgetRef.current) {
      setStatus("Widget ainda nao esta pronto")
      return
    }

    setStatus("Abrindo widget do Pluggy...")
    setIsOpening(true)
    widgetRef.current.show()
  }

  return (
    <main className="min-h-screen bg-muted/30 p-6 md:p-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="gap-3">
            <CardTitle className="text-2xl">Conectar contas</CardTitle>
            <CardDescription>
              Use o widget do Pluggy para entrar no MeuPluggy com Google e
              salvar os itens retornados.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Status da conexao</p>
                <p className="text-sm text-muted-foreground">{status}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleOpenWidget}
                  disabled={!token || isOpening}
                  size="lg"
                >
                  {isOpening ? "Abrindo..." : "Conectar conta"}
                </Button>

                <Button
                  onClick={() => {
                    void loadItems()
                  }}
                  disabled={isRefreshing}
                  variant="outline"
                  size="lg"
                >
                  {isRefreshing ? "Atualizando..." : "Atualizar itens"}
                </Button>
              </div>
            </div>

            <div className="hidden">
              {token ? (
                <PluggyConnect
                  connectToken={token}
                  innerRef={(instance) => {
                    widgetRef.current = instance
                  }}
                  onSuccess={(payload) => {
                    void handleSuccess(payload as PluggySuccessPayload)
                  }}
                  onError={(error) => {
                    handleError(error as PluggyErrorPayload)
                  }}
                  onClose={() => {
                    setIsOpening(false)
                    setStatus((current) =>
                      current.startsWith("Conectado com sucesso") ||
                      current.startsWith("Erro no widget")
                        ? current
                        : "Widget fechado"
                    )
                  }}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle>Itens salvos</CardTitle>
            <CardDescription>
              O item selecionado sera usado pelas rotas de contas e transacoes
              quando `itemId` nao for informado.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-background p-6 text-sm text-muted-foreground">
                Nenhum item salvo ainda.
              </div>
            ) : (
              <div className="grid gap-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {item.connectorName ?? "MeuPluggy"}
                        </p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusTone(
                            item.status
                          )}`}
                        >
                          {item.status ?? "sem status"}
                        </span>
                        {item.isSelected ? (
                          <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                            selecionado
                          </span>
                        ) : null}
                      </div>

                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {item.pluggyItemId}
                      </p>
                    </div>

                    <div className="flex shrink-0 gap-2">
                      <Button
                        onClick={() => {
                          void selectItem(item)
                        }}
                        variant={item.isSelected ? "secondary" : "outline"}
                      >
                        {item.isSelected ? "Em uso" : "Usar item"}
                      </Button>

                      <Button
                        onClick={() => {
                          void loadItems()
                        }}
                        variant="ghost"
                      >
                        Atualizar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
