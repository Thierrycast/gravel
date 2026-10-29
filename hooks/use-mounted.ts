import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * `true` só depois da hidratação — para o que depende do navegador (tema,
 * localStorage) e não pode divergir do HTML do servidor. Substitui o
 * `useEffect(() => setMounted(true))`, que renderiza duas vezes à toa.
 */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
