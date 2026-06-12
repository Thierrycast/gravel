import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { syncPluggyItem } from "@/lib/pluggy-sync"

export async function POST(req: Request) {
  // 1. Shared-secret validation. If PLUGGY_WEBHOOK_SECRET is configured,
  //    require X-Webhook-Secret header to match in constant time.
  const expectedSecret = process.env.PLUGGY_WEBHOOK_SECRET
  if (expectedSecret) {
    const provided = req.headers.get("x-webhook-secret") ?? ""
    if (!constantTimeEquals(provided, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let body: { event?: string; id?: string; itemId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { event, id, itemId } = body
  if (!event || !id) {
    return NextResponse.json({ error: "Missing event or id" }, { status: 400 })
  }

  const stateKey = `webhook-event-${id}`

  // 2. Atomic idempotency claim. Insert the state row as RUNNING;
  //    a unique-violation (P2002) means another request is already processing it.
  try {
    await prisma.domainSyncState.create({
      data: {
        stateKey,
        status: "RUNNING",
        lastProjectedAt: new Date(),
        metaJson: JSON.stringify({ event, itemId, startedAt: new Date().toISOString() }),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Row already exists. Only skip if a previous attempt completed successfully;
      // allow retries when the prior run is still RUNNING or ended in ERROR.
      const existing = await prisma.domainSyncState.findUnique({ where: { stateKey } })
      if (existing?.status === "SUCCESS") {
        return NextResponse.json({ ok: true, skipped: true })
      }
      if (existing?.status === "RUNNING") {
        // Another worker owns it — ask Pluggy to retry later.
        return NextResponse.json({ ok: false, inFlight: true }, { status: 409 })
      }
      // ERROR state: take it over for another attempt.
      await prisma.domainSyncState.update({
        where: { stateKey },
        data: {
          status: "RUNNING",
          lastProjectedAt: new Date(),
          metaJson: JSON.stringify({ event, itemId, retriedAt: new Date().toISOString() }),
        },
      })
    } else {
      throw err
    }
  }

  // 3. Process the event. Marking state only transitions to SUCCESS after the
  //    downstream sync completes; failures record ERROR so Pluggy can retry.
  try {
    switch (event) {
      case "item/updated":
      case "item/created":
      case "transactions/created":
        if (itemId) {
          await syncPluggyItem(itemId)
        }
        break

      case "item/deleted":
        break

      default:
        break
    }

    await prisma.domainSyncState.update({
      where: { stateKey },
      data: {
        status: "SUCCESS",
        lastProjectedAt: new Date(),
        metaJson: JSON.stringify({ event, itemId, completedAt: new Date().toISOString() }),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Pluggy Webhook] Error processing webhook:", error)
    await prisma.domainSyncState
      .update({
        where: { stateKey },
        data: {
          status: "ERROR",
          lastProjectedAt: new Date(),
          metaJson: JSON.stringify({
            event,
            itemId,
            failedAt: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      })
      .catch(() => {
        // Swallow — we still want to respond 500 to trigger Pluggy retry.
      })
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) {
    // timingSafeEqual requires equal length; still consume a compare on a dummy
    // of equal length to avoid short-circuit timing leaks.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}
