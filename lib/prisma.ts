import { PrismaClient } from "@prisma/client";

declare global {
  var prismaBase: PrismaClient | undefined;
}

/**
 * Cofre central para persistência de dados financeiros.
 * Implementa padrão Singleton e ativa modo WAL para SQLite.
 */
const prismaBase =
  globalThis.prismaBase ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

const prismaBootstrap = globalThis.prismaBase
  ? Promise.resolve()
  : prismaBase
      .$connect()
      .then(async () => {
        // WAL mode melhora drasticamente performance e evita locks no SQLite
        await prismaBase.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`);
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("⚠️ Falha ao configurar PRAGMA WAL no SQLite:", err);
        }
      });

void prismaBootstrap;

export const prisma = prismaBase;

/**
 * Garante que a conexão e configurações do banco estejam prontas.
 * Útil para Server Components e Scripts de CLI.
 */
export async function ensurePrismaReady() {
  await prismaBootstrap;
}

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaBase = prismaBase;
}
