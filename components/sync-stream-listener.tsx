"use client"

import { useSyncStream } from "@/hooks/use-sync-stream"

/**
 * Mantém uma assinatura do stream de sincronização viva enquanto o app está
 * aberto. Sem isso, o dado que chega por webhook só apareceria no próximo
 * refetch do React Query — a atualização não seria "ao vivo".
 *
 * Não renderiza nada; monta uma vez, no layout raiz.
 */
export function SyncStreamListener() {
  useSyncStream({ notify: true })
  return null
}
