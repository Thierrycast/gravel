import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseMetadata(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const { billId } = await params;
    const body = await request.json();
    const paidAt =
      typeof body.paidAt === "string" && body.paidAt
        ? new Date(body.paidAt)
        : new Date();

    if (Number.isNaN(paidAt.getTime())) {
      return jsonError(new Error("Data de pagamento inválida"), 400);
    }

    const bill = await prisma.domainBill.findUnique({
      where: { id: billId },
      select: { metadataJson: true },
    });
    if (!bill) return jsonError(new Error("Fatura não encontrada"), 404);

    const metadata = parseMetadata(bill.metadataJson);
    const updated = await prisma.domainBill.update({
      where: { id: billId },
      data: {
        status: "PAID",
        metadataJson: JSON.stringify({
          ...metadata,
          manualPayment: {
            paidAt: paidAt.toISOString(),
            source: "manual",
          },
        }),
      },
    });

    return jsonOk({ results: updated });
  } catch (error) {
    return jsonError(error);
  }
}
