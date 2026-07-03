import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Preenche o cadastro de pessoas a partir de empréstimos antigos que só têm
 * friendName (criados antes do registro de pessoas existir). Idempotente.
 */
async function backfillPeopleFromLends() {
  const orphanLends = await prisma.domainLend.findMany({
    where: { personId: null },
  });
  for (const lend of orphanLends) {
    const name = lend.friendName.trim();
    if (!name) continue;
    const person = await prisma.domainPerson.upsert({
      where: { name },
      update: lend.friendPhone ? { phone: lend.friendPhone } : {},
      create: { name, phone: lend.friendPhone },
    });
    await prisma.domainLend.update({
      where: { id: lend.id },
      data: { personId: person.id },
    });
  }
}

export async function GET() {
  try {
    await backfillPeopleFromLends();

    const [people, lends, shares] = await Promise.all([
      prisma.domainPerson.findMany({ orderBy: { name: "asc" } }),
      prisma.domainLend.findMany(),
      prisma.domainSplitShare.findMany({ include: { splitBill: true } }),
    ]);

    const results = people.map((person) => {
      const personLends = lends.filter((l) => l.personId === person.id);
      const personShares = shares.filter((s) => s.personId === person.id);

      const pendingLends = personLends.filter((l) => l.status === "PENDING");
      const pendingShares = personShares.filter((s) => s.status === "PENDING");
      const pendingTotal =
        pendingLends.reduce((sum, l) => sum + Number(l.amount), 0) +
        pendingShares.reduce((sum, s) => sum + Number(s.amount), 0);
      const settledTotal =
        personLends
          .filter((l) => l.status === "PAID")
          .reduce((sum, l) => sum + Number(l.amount), 0) +
        personShares
          .filter((s) => s.status === "PAID")
          .reduce((sum, s) => sum + Number(s.amount), 0);

      return {
        id: person.id,
        name: person.name,
        phone: person.phone,
        notes: person.notes,
        metrics: {
          pendingTotal: Math.round(pendingTotal * 100) / 100,
          settledTotal: Math.round(settledTotal * 100) / 100,
          openItems: pendingLends.length + pendingShares.length,
          totalItems: personLends.length + personShares.length,
        },
      };
    });

    return jsonOk({ results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      phone?: string | null;
      notes?: string | null;
    };
    const name = body.name?.trim();
    if (!name) {
      return jsonError(new Error("Nome é obrigatório"), 400);
    }
    const existing = await prisma.domainPerson.findUnique({ where: { name } });
    if (existing) {
      return jsonError(new Error("Já existe uma pessoa com esse nome"), 409);
    }
    const person = await prisma.domainPerson.create({
      data: {
        name,
        phone: body.phone?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    return jsonOk({ results: person });
  } catch (error) {
    return jsonError(error);
  }
}
