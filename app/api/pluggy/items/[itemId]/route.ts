import { NextResponse } from "next/server"

import { deletePluggyItem } from "@/lib/pluggy-items"
import { deleteItem as deletePluggyRemoteItem } from "@/lib/integrations/pluggy"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await context.params

  if (!itemId) {
    return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 })
  }

  // best-effort: local pointer dropped even on remote failure so user can recover
  try {
    await deletePluggyRemoteItem(itemId)
  } catch {
    // ignore — local cleanup still proceeds
  }

  try {
    await deletePluggyItem(itemId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao remover item" },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
