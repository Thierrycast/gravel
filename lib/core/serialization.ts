import { Prisma } from "@prisma/client"

type SerializedDomain<T> =
  T extends Prisma.Decimal ? number :
  T extends Date ? string :
  T extends Array<infer Item> ? SerializedDomain<Item>[] :
  T extends object ? { [Key in keyof T]: SerializedDomain<T[Key]> } :
  T

function serializeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value

  if (value instanceof Prisma.Decimal) {
    return value.toNumber()
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen))
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new TypeError("serializeDomain cannot serialize circular references")
    }

    seen.add(value)

    const result: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = serializeValue(nestedValue, seen)
    }

    seen.delete(value)
    return result
  }

  return value
}

export function serializeDomain<T>(data: T): SerializedDomain<T> {
  return serializeValue(data, new WeakSet<object>()) as SerializedDomain<T>
}
