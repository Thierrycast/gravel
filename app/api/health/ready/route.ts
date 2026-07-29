import { constants } from "node:fs"
import { access } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Extrai o caminho do arquivo SQLite de DATABASE_URL ("file:/app/data/prod.db").
 * Devolve null para qualquer coisa que não seja SQLite em arquivo — aí a
 * checagem de escrita é simplesmente pulada em vez de dar falso negativo.
 */
function sqlitePath(): string | null {
  const url = process.env.DATABASE_URL ?? ""
  if (!url.startsWith("file:")) return null
  const raw = url.slice("file:".length).split("?")[0]
  if (!raw || raw === ":memory:") return null
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw)
}

/**
 * Endpoint de prontidão (Readiness Check).
 *
 * Verifica duas coisas: que o banco responde, e que ele continua gravável.
 *
 * ## Por que NÃO usa mais BEGIN IMMEDIATE (mudança de 28/07/2026)
 *
 * A versão anterior fazia `BEGIN IMMEDIATE` + `ROLLBACK` para provar que dava
 * para escrever. Isso tem dois problemas, os dois medidos nos logs de 24h:
 *
 * 1. **`BEGIN IMMEDIATE` toma o lock de ESCRITA do banco de produção.** O
 *    healthcheck do Docker roda a cada 30s, então a cada 30s a checagem
 *    disputava lock com o uso real do app. Deu `database is locked` 39 vezes
 *    em 24h — ou seja, a checagem degradava justamente o que media, e ainda
 *    reportava o app como não-pronto por culpa própria.
 *
 * 2. **`BEGIN` e `ROLLBACK` não têm garantia de cair na mesma conexão.** O
 *    Prisma tem pool; `$executeRawUnsafe` pega qualquer conexão livre. Daí os
 *    43 `cannot rollback - no transaction is active` em 24h: o ROLLBACK
 *    chegava numa conexão que nunca abriu transação. E no pior caso o BEGIN
 *    ficava aberto numa conexão do pool, segurando o lock.
 *
 * A checagem de escrita agora é feita pelo sistema de arquivos (`W_OK` no
 * arquivo e no diretório), que é o que realmente pega o cenário de interesse
 * neste lab: mount virando somente-leitura ou disco cheio — inclusive o caso
 * conhecido do HD USB que, se cai, deixa o app gravando em outro lugar.
 * Nenhum lock é tomado.
 */
export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1")

    const db = sqlitePath()
    if (db) {
      // O diretório também: sem escrita nele o SQLite não cria o -wal/-journal.
      await access(db, constants.W_OK)
      await access(path.dirname(db), constants.W_OK)
    }

    return NextResponse.json({
      status: "ready",
      database: "connected",
      writable: db ? true : "nao-verificado",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    // Falha silenciosa em prod para não expor caminhos, log detalhado em dev
    if (process.env.NODE_ENV === "development") {
      console.error("[Readiness Check] Error:", error)
    }

    return NextResponse.json(
      { status: "unavailable", error: "Database not writable" },
      { status: 503 }
    )
  }
}
