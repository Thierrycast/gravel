"use client"

import { useEffect } from "react"

import { PageError } from "@/components/page-error"

/**
 * Fronteira de erro local de /cash-flow.
 *
 * Só existia `app/error.tsx`, a fronteira raiz: qualquer exceção nesta página —
 * e estas são as mais pesadas em dado e gráfico — derrubava o layout inteiro,
 * menu lateral incluído, deixando o usuário sem para onde navegar. Contida
 * aqui, o resto do app continua de pé e o `reset` recarrega só esta rota.
 */
export default function CashFlowError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[/cash-flow]", error)
  }, [error])

  return (
    <div className="py-6">
      <PageError
        message={error.message || "Não foi possível carregar o fluxo de caixa."}
        refetch={() => reset()}
      />
    </div>
  )
}
