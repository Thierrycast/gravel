import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await params;
    const body = await request.json();

    const allowedFields = ["nickname"] as const;
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(
        new Error(
          "Nenhum campo válido para atualização. Campos permitidos: nickname",
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
