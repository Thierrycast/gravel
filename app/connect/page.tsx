"use client"

import { useEffect, useState } from "react"
import { PluggyConnect } from "react-pluggy-connect"

export default function ConnectPage() {
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("Carregando token...")
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    async function loadToken() {
      try {
        const response = await fetch("/api/pluggy/connect-token", {
          method: "POST",
        })
        const data = await response.json()
        if (!data?.accessToken) {
          throw new Error("Token invalido")
        }
        setToken(data.accessToken)
        setStatus("Token pronto")
      } catch (error) {
        setStatus("Falha ao gerar token")
      }
    }

    loadToken()
  }, [])

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Conectar conta</h1>
      <p className="text-sm text-muted-foreground">{status}</p>

      {itemId ? (
        <p className="mt-4 text-sm">Item conectado: {itemId}</p>
      ) : null}

      {token ? (
        <div className="mt-6">
          <PluggyConnect
            connectToken={token}
            onSuccess={(payload) => {
              const id = payload?.item?.id
              if (id) {
                setItemId(id)
              }
              setStatus("Conectado com sucesso")
            }}
            onError={(error) => {
              setStatus(`Erro: ${error?.message ?? "Falha ao conectar"}`)
            }}
            onClose={() => {
              if (!itemId) {
                setStatus("Widget fechado")
              }
            }}
          />
        </div>
      ) : null}
    </main>
  )
}
