/**
 * Barramento de eventos de sincronização, in-process.
 *
 * O Gravel roda como uma instância única (um container, um processo Node), então
 * um emitter em memória basta para empurrar mudanças ao browser por SSE — sem
 * Redis, sem polling de 5s. Quem publica: o webhook da Pluggy, o scheduler e o
 * sync manual. Quem consome: `app/api/sync/events/route.ts`.
 */

export type SyncEventType =
  | "sync:started"
  | "sync:progress"
  | "sync:done"
  | "sync:error"
  | "item:updated"
  | "item:needs_action"
  | "connector:status"
  | "transactions:changed"

export type SyncEvent = {
  type: SyncEventType
  /** Timestamp ISO de emissão — o cliente usa para descartar evento repetido. */
  at: string
  /** Provider/escopo (`pluggy`, `binance`, `scheduler`…). */
  source?: string
  itemId?: string
  message?: string
  data?: Record<string, unknown>
}

type Listener = (event: SyncEvent) => void

type Bus = {
  listeners: Set<Listener>
  /** Últimos eventos, para um cliente que acaba de conectar não começar cego. */
  recent: SyncEvent[]
}

const RECENT_LIMIT = 20

declare global {
  var gravelSyncEventBus: Bus | undefined
}

function getBus(): Bus {
  if (!globalThis.gravelSyncEventBus) {
    globalThis.gravelSyncEventBus = { listeners: new Set(), recent: [] }
  }
  return globalThis.gravelSyncEventBus
}

export function publishSyncEvent(
  event: Omit<SyncEvent, "at"> & { at?: string },
) {
  const bus = getBus()
  const full: SyncEvent = { ...event, at: event.at ?? new Date().toISOString() }

  bus.recent.push(full)
  if (bus.recent.length > RECENT_LIMIT) {
    bus.recent.splice(0, bus.recent.length - RECENT_LIMIT)
  }

  for (const listener of bus.listeners) {
    try {
      listener(full)
    } catch (error) {
      // Um consumidor quebrado (stream fechado no meio) não pode derrubar o
      // sync que está publicando.
      console.warn(
        `[sync-events] listener falhou: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  return full
}

export function subscribeSyncEvents(listener: Listener) {
  const bus = getBus()
  bus.listeners.add(listener)
  return () => {
    bus.listeners.delete(listener)
  }
}

export function getRecentSyncEvents() {
  return [...getBus().recent]
}

export function getSyncEventSubscriberCount() {
  return getBus().listeners.size
}
