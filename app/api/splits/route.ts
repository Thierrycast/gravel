import { Prisma } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/core/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const splits = await prisma.domainSplitBill.findMany({
      orderBy: { date: "desc" },
      include: {
        shares: { include: { person: true } },
      },
    });

    const results = splits.map((split) => {
      const pending = split.shares.filter((s) => s.status === "PENDING");
      return {
        id: split.id,
        title: split.title,
        totalAmount: Number(split.totalAmount),
        date: split.date.toISOString(),
        domainTransactionId: split.domainTransactionId,
        notes: split.notes,
        pendingTotal:
          Math.round(
            pending.reduce((sum, s) => sum + Number(s.amount), 0) * 100,
          ) / 100,
        shares: split.shares.map((share) => ({
          id: share.id,
          personId: share.personId,
          personName: share.person.name,
          amount: Number(share.amount),
          status: share.status,
          paidAt: share.paidAt?.toISOString() ?? null,
        })),
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
      title?: string;
      totalAmount?: number;
      date?: string;
      domainTransactionId?: string | null;
      notes?: string | null;
      shares?: Array<{ personId?: string; amount?: number }>;
    };

    const title = body.title?.trim();
    if (!title) return jsonError(new Error("Título é obrigatório"), 400);

    const totalAmount = Number(body.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return jsonError(new Error("Valor total inválido"), 400);
    }

    const shares = Array.isArray(body.shares) ? body.shares : [];
    if (shares.length === 0) {
      return jsonError(new Error("Adicione pelo menos uma pessoa"), 400);
    }
    for (const share of shares) {
      if (!share.personId) {
        return jsonError(new Error("Cada parte precisa de uma pessoa"), 400);
      }
      const amount = Number(share.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonError(new Error("Valor por pessoa inválido"), 400);
      }
    }
    const personIds = shares.map((s) => s.personId as string);
    if (new Set(personIds).size !== personIds.length) {
      return jsonError(new Error("Pessoa repetida na divisão"), 400);
    }

    const sharesSum = shares.reduce((sum, s) => sum + Number(s.amount), 0);
    // A diferença entre o total e a soma das partes é a parte do próprio
    // usuário — só é erro se as partes excederem o total.
    if (sharesSum - totalAmount > 0.009) {
      return jsonError(
        new Error("A soma das partes excede o valor total da conta"),
        400,
      );
    }

    const people = await prisma.domainPerson.findMany({
      where: { id: { in: personIds } },
    });
    if (people.length !== personIds.length) {
      return jsonError(new Error("Pessoa não encontrada"), 404);
    }

    if (body.domainTransactionId) {
      const tx = await prisma.domainTransaction.findUnique({
        where: { id: body.domainTransactionId },
      });
      if (!tx) return jsonError(new Error("Transação não encontrada"), 404);
    }

    const split = await prisma.domainSplitBill.create({
      data: {
        title,
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        date: body.date ? new Date(body.date) : new Date(),
        domainTransactionId: body.domainTransactionId ?? null,
        notes: body.notes?.trim() || null,
        shares: {
          create: shares.map((share) => ({
            personId: share.personId as string,
            amount: new Prisma.Decimal(Number(share.amount).toFixed(2)),
          })),
        },
      },
      include: { shares: { include: { person: true } } },
    });

    return jsonOk({ results: split });
  } catch (error) {
    return jsonError(error);
  }
}
