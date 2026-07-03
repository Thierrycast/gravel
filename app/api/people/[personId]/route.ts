import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const { personId } = await params;
    const body = (await request.json()) as {
      name?: string;
      phone?: string | null;
      notes?: string | null;
    };

    const data: Record<string, string | null> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return jsonError(new Error("Nome é obrigatório"), 400);
      const clash = await prisma.domainPerson.findUnique({ where: { name } });
      if (clash && clash.id !== personId) {
        return jsonError(new Error("Já existe uma pessoa com esse nome"), 409);
      }
      data.name = name;
    }
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    const person = await prisma.domainPerson.update({
      where: { id: personId },
      data,
    });

    // Mantém empréstimos antigos coerentes com o cadastro.
    if (data.name !== undefined || data.phone !== undefined) {
      await prisma.domainLend.updateMany({
        where: { personId },
        data: {
          ...(data.name !== undefined ? { friendName: person.name } : {}),
          ...(data.phone !== undefined ? { friendPhone: person.phone } : {}),
        },
      });
    }

    return jsonOk({ results: person });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    const { personId } = await params;
    const [pendingLends, pendingShares] = await Promise.all([
      prisma.domainLend.count({ where: { personId, status: "PENDING" } }),
      prisma.domainSplitShare.count({ where: { personId, status: "PENDING" } }),
    ]);
    if (pendingLends + pendingShares > 0) {
      return jsonError(
        new Error(
          "Esta pessoa tem valores pendentes. Quite ou remova os itens antes de excluí-la.",
        ),
        409,
      );
    }
    // Desvincula o histórico (empréstimos pagos mantêm friendName).
    await prisma.domainLend.updateMany({
      where: { personId },
      data: { personId: null },
    });
    await prisma.domainSplitShare.deleteMany({ where: { personId } });
    await prisma.domainPerson.delete({ where: { id: personId } });
    return jsonOk({ results: { deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
