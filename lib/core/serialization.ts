import { Prisma } from "@prisma/client"

/**
 * Recursively serializes domain objects, converting Prisma.Decimal to number.
 * This ensures clean serialization between Server and Client components (Task 4.1).
 */
export function serializeDomain<T>(data: T): T {
  if (data === null || data === undefined) return data

  // Handle Decimal
  if (data instanceof Prisma.Decimal) {
    return data.toNumber() as unknown as T
  }

  // Handle Array
  if (Array.isArray(data)) {
    return data.map(item => serializeDomain(item)) as unknown as T
  }

  // Handle Object
  if (typeof data === "object") {
    // Check if it's a Date
    if (data instanceof Date) return data as unknown as T

    const result: any = {}
    for (const [key, value] of Object.entries(data)) {
      result[key] = serializeDomain(value)
    }
    return result as T
  }

  return data
}
