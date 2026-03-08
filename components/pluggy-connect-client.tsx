"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

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

const PluggyConnect = dynamic(
  () => import("react-pluggy-connect").then((mod) => mod.PluggyConnect),
  { ssr: false }
)

type StoredItem = {
  id: string
  pluggyItemId: string
  connectorName: string | null
  status: string | null
  isSelected: boolean
}

export function PluggyConnectClient() {
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState("Carregando token...")
  const [items, setItems] = useState<StoredItem[]>([])

  async function loadItems() {
    const response = await fetch("/api/pluggy/items", { cache: "no-store" })
    const data = await response.json()
    setItems(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    async function load() {
      try {
        const [tokenResponse] = await Promise.all([
          fetch("/api/pluggy/connect-token", { method: "POST" }),
          loadItems(),
        ])

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
  }

  function handleError(error: PluggyErrorPayload) {
    const suffix = error.code ? ` (${error.code})` : ""
    setStatus(`Erro no widget: ${error.message ?? "falha ao conectar"}${suffix}`)
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Conectar conta</h1>
      <p className="text-sm text-muted-foreground">{status}</p>

      {token ? (
        <div className="mt-6">
          <PluggyConnect
            connectToken={token}
            onSuccess={(payload) => {
              void handleSuccess(payload as PluggySuccessPayload)
            }}
            onError={(error) => {
              handleError(error as PluggyErrorPayload)
            }}
            onClose={() => {
              setStatus((current) =>
                current.startsWith("Conectado com sucesso")
                  ? current
                  : "Widget fechado"
              )
            }}
          />
        </div>
      ) : null}

      {items.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-medium">Itens salvos</h2>
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border px-3 py-2"
              >
                <p>{item.connectorName ?? "MeuPluggy"}</p>
                <p className="text-muted-foreground">{item.pluggyItemId}</p>
                <p className="text-muted-foreground">
                  {item.status ?? "sem status"}
                  {item.isSelected ? " · selecionado" : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
