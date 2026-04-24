import { PrismaClient } from "@prisma/client"

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  })

// Optimization: Enable WAL mode for SQLite concurrency
if (!globalThis.prisma) {
  prisma.$executeRawUnsafe(`PRAGMA journal_mode = WAL;`).catch((err) => {
    console.error("Failed to enable WAL mode:", err)
  })
  prisma.$executeRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch((err) => {
    console.error("Failed to enable synchronous NORMAL:", err)
  })
}

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma
}

