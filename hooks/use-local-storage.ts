import { useCallback, useMemo, useSyncExternalStore } from "react"

const LOCAL_EVENT = "gravel:local-storage"

function subscribe(onChange: () => void) {
  // `storage` cobre outras abas; o evento local cobre esta, que não recebe o
  // próprio `storage`.
  window.addEventListener("storage", onChange)
  window.addEventListener(LOCAL_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(LOCAL_EVENT, onChange)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Estado JSON persistido no navegador, lido como fonte externa: o servidor e a
 * hidratação veem `fallback`, e o valor salvo entra logo depois — sem o
 * `useEffect` + `setState` que renderizava a tela duas vezes.
 */
export function useLocalStorageState<T>(key: string, fallback: T) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )

  const value = useMemo<T>(() => {
    if (raw == null) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
    // `fallback` é um valor inicial; mudá-lo não deve reler o armazenamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw])

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Armazenamento bloqueado (aba anônima, cota): o valor vive só nesta renderização.
      }
      window.dispatchEvent(new Event(LOCAL_EVENT))
    },
    [key],
  )

  return [value, setValue] as const
}
