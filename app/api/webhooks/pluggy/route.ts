import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncPluggyItem } from "@/lib/pluggy-sync"

/**
 * Webhook handler for Pluggy events.
 * Implements Task 3.1: Pluggy Webhook Handler.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { event, id, itemId } = body

    console.log(`[Pluggy Webhook] Received event: ${event} for id: ${id}, itemId: ${itemId}`)

    // 1. Idempotency Check
    // We should ideally store event IDs to avoid processing the same webhook twice.
    const existingEvent = await prisma.domainSyncState.findUnique({
      where: { stateKey: `webhook-event-${id}` }
    })

    if (existingEvent) {
      console.log(`[Pluggy Webhook] Event ${id} already processed. Skipping.`)
      return NextResponse.json({ ok: true, skipped: true })
    }

    // 2. Handle specific events
    switch (event) {
      case "item/updated":
      case "item/created":
      case "transactions/created":
        if (itemId) {
          // Trigger an incremental sync for the item
          // Note: In a production environment with heavy load, 
          // this should be queued (Pillar 7: Ingestion Isolation).
          console.log(`[Pluggy Webhook] Triggering sync for item: ${itemId}`)
          
          // We run it as a background task (don't await fully if it's too long, 
          // but Next.js Route Handlers have execution limits).
          // For now, we await to ensure it finishes or use a promise that runs in background.
          syncPluggyItem(itemId).catch(err => {
            console.error(`[Pluggy Webhook] Sync failed for item ${itemId}:`, err)
          })
        }
        break

      case "item/deleted":
        if (itemId) {
          console.log(`[Pluggy Webhook] Item deleted: ${itemId}`)
          // Mark item as deleted in our domain or clean up
        }
        break

      default:
        console.log(`[Pluggy Webhook] Unhandled event type: ${event}`)
    }

    // 3. Mark event as processed
    await prisma.domainSyncState.upsert({
      where: { stateKey: `webhook-event-${id}` },
      create: {
        stateKey: `webhook-event-${id}`,
        lastProjectedAt: new Date(),
        metaJson: JSON.stringify({ event, itemId, timestamp: new Date().toISOString() })
      },
      update: {
        lastProjectedAt: new Date(),
        metaJson: JSON.stringify({ event, itemId, timestamp: new Date().toISOString() })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Pluggy Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
