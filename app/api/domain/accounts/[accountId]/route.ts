import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    const body = await request.json();

    const account = await prisma.domainAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return jsonError(new Error("Conta não encontrada"), 404);
    }

    if (account.kind !== "CASH") {
      return jsonError(
        new Error("Ajuste de saldo manual permitido apenas para carteiras físicas"),
        400,
      );
    }

    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return jsonError(new Error("Valor inválido para ajuste"), 400);
    }

    const current = Number(account.balance ?? 0);
    const newBalance = current + delta;

    const updated = await prisma.domainAccount.update({
      where: { id: accountId },
      data: { balance: newBalance },
    });

    return jsonOk({ results: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if ("nickname" in body) {
      updateData.nickname = body.nickname;
    }

    for (const field of ["billingClosingDay", "billingDueDay"] as const) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw === null) {
        updateData[field] = null;
        continue;
      }
      const day = Number(raw);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        return jsonError(
          new Error(`${field} deve ser um dia do mês entre 1 e 31`),
          400,
        );
      }
      updateData[field] = day;
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(
        new Error(
          "Nenhum campo válido para atualização. Campos permitidos: nickname, billingClosingDay, billingDueDay",
        ),
        400,
      );
    }

    const updated = await prisma.domainAccount.update({
      where: { id: accountId },
      data: updateData,
    });

    return jsonOk({
      results: updated,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    const account = await prisma.domainAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return jsonError(new Error("Conta não encontrada"), 404);
    }

    return jsonOk({
      results: account,
    });
  } catch (error) {
    return jsonError(error);
  }
}
