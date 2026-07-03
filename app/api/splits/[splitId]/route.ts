import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ splitId: string }> },
) {
  try {
    const { splitId } = await params;
    const body = (await request.json()) as {
      shareId?: string;
      status?: string;
    };

    if (!body.shareId || !body.status) {
      return jsonError(new Error("shareId e status são obrigatórios"), 400);
    }
    if (body.status !== "PAID" && body.status !== "PENDING") {
      return jsonError(new Error("Status inválido"), 400);
    }

    const share = await prisma.domainSplitShare.findUnique({
      where: { id: body.shareId },
    });
    if (!share || share.splitBillId !== splitId) {
      return jsonError(new Error("Parte não encontrada"), 404);
    }

    const updated = await prisma.domainSplitShare.update({
      where: { id: body.shareId },
      data: {
        status: body.status,
        paidAt: body.status === "PAID" ? new Date() : null,
      },
      include: { person: true },
    });

    return jsonOk({ results: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ splitId: string }> },
) {
  try {
    const { splitId } = await params;
    await prisma.domainSplitBill.delete({ where: { id: splitId } });
    return jsonOk({ results: { deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
