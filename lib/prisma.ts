import { PrismaClient } from "@prisma/client"

declare global {
  var prismaBase: PrismaClient | undefined
}

const prismaBase =
  globalThis.prismaBase ||
  new PrismaClient({
    log: ["error", "warn"],
  })

const prismaBootstrap = globalThis.prismaBase
  ? Promise.resolve()
  : prismaBase.$connect()
      .then(async () => {
        await prismaBase.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`)
        await prismaBase.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`)
        await prismaBase.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`)
      })
      .catch((err) => {
        console.error("Failed to configure SQLite pragmas:", err)
      })

void prismaBootstrap

export const prisma = prismaBase

export async function ensurePrismaReady() {
  await prismaBootstrap
}

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaBase = prismaBase
}
