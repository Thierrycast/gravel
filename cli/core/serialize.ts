/**
 * Recursively converts Prisma Decimal, BigInt, and Date values into
 * JSON-friendly primitives. Used by the snapshot/export pipelines so the
 * resulting bundles are stable and consumable by external tools.
 */
export function serializeDecimal(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "bigint") return Number(value)
  if (typeof value === "object") {
    if ("toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
      return (value as { toNumber: () => number }).toNumber()
    }
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map(serializeDecimal)
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeDecimal(val)
    }
    return result
  }
  return value
}
