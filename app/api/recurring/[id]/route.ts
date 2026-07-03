import { NextResponse } from "next/server";

import { serializeForJson } from "@/lib/core/http";
import {
  deleteRecurringRule,
  isRecurringInterval,
  updateRecurringRule,
} from "@/lib/domain/recurring";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const input: Parameters<typeof updateRecurringRule>[1] = {};

  if (typeof body.name === "string" && body.name.trim()) {
    input.name = body.name.trim();
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Valor deve ser maior que zero" },
        { status: 400 },
      );
    }
    input.amount = Math.round(amount * 100) / 100;
  }
  if (body.interval !== undefined) {
    if (!isRecurringInterval(body.interval as string)) {
      return NextResponse.json(
        { error: "Periodicidade inválida" },
        { status: 400 },
      );
    }
    input.interval = body.interval as NonNullable<typeof input.interval>;
  }
  if (body.type === "INCOME" || body.type === "EXPENSE") {
    input.type = body.type;
  }
  if (body.nextDate !== undefined) {
    const nextDate = new Date(String(body.nextDate));
    if (Number.isNaN(nextDate.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }
    input.nextDate = nextDate;
  }
  if (body.categoryId !== undefined) {
    input.categoryId =
      typeof body.categoryId === "string" && body.categoryId
        ? body.categoryId
        : null;
  }
  if (typeof body.active === "boolean") {
    input.active = body.active;
  }

  const updated = await updateRecurringRule(id, input);
  if (!updated) {
    return NextResponse.json(
      { error: "Recorrência não encontrada" },
      { status: 404 },
    );
  }
  return NextResponse.json(serializeForJson(updated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deleted = await deleteRecurringRule(id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Recorrência não encontrada" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true });
}
