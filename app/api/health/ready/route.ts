import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Endpoint de prontidão (Readiness Check).
 * Verifica se a API está UP e se o banco de dados SQLite aceita operações de escrita.
 */
export async function GET() {
  try {
    // Testa leitura básica
    await prisma.$queryRawUnsafe("SELECT 1")
    
    // Testa escrita (dentro de transação segura que faz rollback)
    await prisma.$executeRawUnsafe("BEGIN IMMEDIATE")
    await prisma.$executeRawUnsafe("ROLLBACK")
    
    return NextResponse.json({ 
      status: "ready",
      database: "connected",
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    // Falha silenciosa em prod para não expor caminhos, log detalhado em dev
    if (process.env.NODE_ENV === "development") {
      console.error("[Readiness Check] Error:", error)
    }

    try {
      await prisma.$executeRawUnsafe("ROLLBACK")
    } catch {
      // Ignora erro no rollback caso o DB esteja totalmente travado
    }

    return NextResponse.json(
      { status: "unavailable", error: "Database not writable" },
      { status: 503 }
    )
  }
}
