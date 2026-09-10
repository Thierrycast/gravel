import { NextResponse } from "next/server"

import { runChat, type ChatTurn } from "@/lib/ai/chat"
import { resolveAiConfig } from "@/lib/ai/config"
import { jsonError } from "@/lib/core/http"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/** Quantas mensagens antigas entram como contexto. Conversa não é infinita. */
const HISTORY_TURNS = 10
const HISTORY_PAGE = 60
const MAX_MESSAGE_LENGTH = 4_000

type StoredMessage = {
  id: string
  role: string
  content: string
  toolCallsJson: string | null
  auditJson: string | null
  createdAt: Date
}

function serialize(message: StoredMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    toolCalls: message.toolCallsJson ? JSON.parse(message.toolCallsJson) : [],
    audit: message.auditJson ? JSON.parse(message.auditJson) : null,
    createdAt: message.createdAt.toISOString(),
  }
}

export async function GET() {
  try {
    const messages = await prisma.aiChatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: HISTORY_PAGE,
    })
    return NextResponse.json({ messages: messages.reverse().map(serialize) })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { message?: unknown }
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!message) {
      return NextResponse.json({ error: "mensagem_vazia" }, { status: 400 })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: "mensagem_longa", limite: MAX_MESSAGE_LENGTH },
        { status: 400 },
      )
    }

    const resolved = await resolveAiConfig()
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.reason }, { status: 400 })
    }

    const previous = await prisma.aiChatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
    })
    const turns: ChatTurn[] = previous
      .reverse()
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({ role: item.role as ChatTurn["role"], content: item.content }))
    turns.push({ role: "user", content: message })

    // A mensagem dele é gravada antes da chamada: se o provedor falhar, a
    // pergunta não se perde junto com o erro.
    const userMessage = await prisma.aiChatMessage.create({
      data: { role: "user", content: message },
    })

    let result
    try {
      result = await runChat(resolved.config, turns)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return NextResponse.json(
        { error: "provedor_falhou", detalhe: detail, userMessage: serialize(userMessage) },
        { status: 502 },
      )
    }

    const assistantMessage = await prisma.aiChatMessage.create({
      data: {
        role: "assistant",
        content: result.text,
        toolCallsJson: JSON.stringify(result.toolCalls),
        auditJson: JSON.stringify({
          provider: resolved.config.kind,
          model: resolved.config.model,
          rounds: result.rounds,
          redactions: result.redactions,
          outboundBytes: result.audits.reduce((sum, audit) => sum + audit.outboundBytes, 0),
          calls: result.audits.length,
        }),
      },
    })

    return NextResponse.json({
      userMessage: serialize(userMessage),
      assistantMessage: serialize(assistantMessage),
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE() {
  try {
    const removed = await prisma.aiChatMessage.deleteMany({})
    return NextResponse.json({ removed: removed.count })
  } catch (error) {
    return jsonError(error)
  }
}
