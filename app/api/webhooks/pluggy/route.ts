import { NextResponse } from "next/server"
import { after } from "next/server"
import { OpsRunStatus, Prisma } from "@prisma/client"

import {
  parseWebhookPayload,
  processQueuedWebhookEvent,
  WebhookPayloadError,
} from "@/lib/ingestion/webhook-events"
import {
  constantTimeEquals,
  getWebhookSecret,
  WEBHOOK_SECRET_HEADER,
} from "@/lib/ingestion/webhook-registry"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * Recebe os eventos da Pluggy.
 *
 * Contrato da Pluggy: **responder 2XX em menos de 5 segundos**, senão a entrega
 * conta como falha e o evento é reenviado até 9 vezes (3 imediatas, 3 após
 * 15 min, 3 após 2 h). Um sync de item leva minutos — então esta rota só
 * autentica, persiste o evento na fila e responde. O trabalho roda depois, via
 * `after()`, e o scheduler redrena o que não terminou.
 */
export async function POST(req: Request) {
  const expectedSecret = await getWebhookSecret()
  if (expectedSecret) {
    const provided = req.headers.get(WEBHOOK_SECRET_HEADER) ?? ""
    if (!constantTimeEquals(provided, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else {
    // Sem secret configurado o endpoint aceita qualquer chamada. Não é motivo
    // para recusar (quebraria um ambiente ainda em setup), mas tem de aparecer.
    console.warn(
      "[Pluggy Webhook] PLUGGY_WEBHOOK_SECRET não configurado — endpoint aberto.",
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let payload
  try {
    payload = parseWebhookPayload(body)
  } catch (error) {
    if (error instanceof WebhookPayloadError) {
      // 400 é definitivo: reenviar o mesmo corpo inválido não ajudaria.
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  // Claim atômica por `eventId`: reenvios da Pluggy não reprocessam o evento.
  let eventRowId: string
  try {
    const created = await prisma.pluggyWebhookEvent.create({
      data: {
        eventId: payload.eventId,
        event: payload.event,
        itemId: payload.itemId ?? undefined,
        accountId: payload.accountId ?? undefined,
        connectorId: payload.connectorId ?? undefined,
        triggeredBy: payload.triggeredBy ?? undefined,
        payloadJson: JSON.stringify(payload.raw),
      },
      select: { id: true },
    })
    eventRowId = created.id
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error
    }

    const existing = await prisma.pluggyWebhookEvent.findUnique({
      where: { eventId: payload.eventId },
      select: { id: true, status: true },
    })

    // Já processado com sucesso: 200 e pronto — nada de 409, que só provocaria
    // mais retries da Pluggy.
    if (!existing || existing.status === OpsRunStatus.SUCCESS) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    eventRowId = existing.id
  }

  after(async () => {
    try {
      await processQueuedWebhookEvent(eventRowId)
    } catch {
      // Já registrado na fila (status ERROR) e logado pelo processador; o tick
      // do scheduler tenta de novo.
    }
  })

  return NextResponse.json({ ok: true, queued: true, event: payload.event })
}

/**
 * Diagnóstico: mostra os últimos eventos recebidos e o estado deles. Útil para
 * saber se a Pluggy está entregando de fato (a maior parte dos problemas de
 * "dado não atualiza" é o webhook nunca chegar).
 */
export async function GET() {
  const [recent, counts] = await Promise.all([
    prisma.pluggyWebhookEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 20,
      select: {
        eventId: true,
        event: true,
        itemId: true,
        status: true,
        attempts: true,
        error: true,
        receivedAt: true,
        processedAt: true,
      },
    }),
    prisma.pluggyWebhookEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ])

  return NextResponse.json({
    counts: Object.fromEntries(
      counts.map((row) => [row.status, row._count._all]),
    ),
    recent,
  })
}
