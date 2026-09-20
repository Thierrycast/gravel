import { NextResponse } from "next/server"
import { after } from "next/server"
import { OpsRunStatus } from "@prisma/client"

import { ensureInternalApiKey } from "@/lib/admin/internal-auth"
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
  //
  // Usa `upsert` em vez de `create` + catch(P2002): o caminho de reenvio é
  // normal, e o catch fazia o Prisma logar `prisma:error` a cada repetição —
  // ruído que parece falha num fluxo que está funcionando.
  let eventRowId: string
  const existing = await prisma.pluggyWebhookEvent.findUnique({
    where: { eventId: payload.eventId },
    select: { id: true, status: true },
  })

  if (existing) {
    // Já processado: 200 e pronto — nada de 409, que só provocaria mais retries.
    if (existing.status === OpsRunStatus.SUCCESS) {
      return NextResponse.json({ ok: true, skipped: true })
    }
    eventRowId = existing.id
  } else {
    const created = await prisma.pluggyWebhookEvent.upsert({
      where: { eventId: payload.eventId },
      update: {},
      create: {
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
 *
 * Exige `X-INTERNAL-API-KEY`. O POST sempre teve o segredo da Pluggy, mas este
 * GET respondia a qualquer um: devolvia `itemId` de cada conexão e o estado da
 * fila, e `/api/webhooks/**` precisa ficar fora do porteiro de sessão (a Pluggy
 * não faz login). Sem esta checagem, a exceção do middleware viraria um buraco.
 */
export async function GET(request: Request) {
  const unauthorized = ensureInternalApiKey(request)
  if (unauthorized) return unauthorized

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
