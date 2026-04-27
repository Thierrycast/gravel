import { DomainCategoryKind, DomainTransactionDirection } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/core/http";
import { normalizeText } from "@/lib/domain/utils";

export const dynamic = "force-dynamic";

function parseMetadata(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value) as {
      overrides?: Record<string, unknown>;
      [key: string]: unknown;
    };
  } catch {
    return {};
  }
}

function normalizedMerchantName(name: string) {
  return normalizeText(name)
    ?.replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;

    const transaction = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return jsonError(new Error("Transação não encontrada"), 404);
    }

    return jsonOk({
      results: transaction,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;
    const body = await request.json();

    const existing = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!existing) {
      return jsonError(new Error("Transação não encontrada"), 404);
    }

    const allowedFields = [
      "domainCategoryId",
      "domainMerchantId",
      "description",
      "ignored",
      "occurredAt",
      "direction",
    ] as const;
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (body.markInternalTransfer === true) {
      const transferCategory = await prisma.domainCategory.findFirst({
        where: {
          OR: [
            { kind: DomainCategoryKind.TRANSFER },
            { slug: "uncategorized-transfer" },
            { name: { contains: "transfer" } },
          ],
        },
        orderBy: [{ kind: "desc" }, { name: "asc" }],
      });
      updateData.direction = DomainTransactionDirection.TRANSFER;
      if (transferCategory) {
        updateData.domainCategoryId = transferCategory.id;
      }
    }

    if (typeof body.merchantName === "string" && body.merchantName.trim()) {
      const displayName = body.merchantName.trim();
      const normalizedName =
        normalizedMerchantName(displayName) ?? displayName.toLowerCase();
      const merchant = await prisma.domainMerchant.upsert({
        where: { normalizedName },
        update: { displayName },
        create: {
          displayName,
          normalizedName,
        },
      });
      updateData.domainMerchantId = merchant.id;
      updateData.merchantName = displayName;
    }

    if (Object.keys(updateData).length === 0) {
      return jsonError(
        new Error(
          "Nenhum campo válido para atualização. Campos permitidos: domainCategoryId, domainMerchantId, merchantName, description, ignored, occurredAt, direction, markInternalTransfer",
        ),
        400,
      );
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const currentMetadata = parseMetadata(existing.metadataJson);
      const overrides = {
        ...(currentMetadata.overrides ?? {}),
      } as Record<string, unknown>;

      if ("occurredAt" in updateData) {
        const parsedDate = new Date(String(updateData.occurredAt));
        if (Number.isNaN(parsedDate.getTime())) {
          throw new Error("Data inválida");
        }
        updateData.occurredAt = parsedDate;
        overrides.occurredAt = parsedDate.toISOString();
      }
      if ("description" in updateData) {
        const description = String(updateData.description).trim();
        updateData.description = description;
        updateData.normalizedDescription = normalizeText(description);
        overrides.description = description;
      }
      if ("domainCategoryId" in updateData) {
        overrides.categoryId = updateData.domainCategoryId;
      }
      if ("domainMerchantId" in updateData) {
        overrides.merchantId = updateData.domainMerchantId;
      }
      if ("merchantName" in updateData) {
        overrides.merchantName = updateData.merchantName;
      }
      if ("direction" in updateData) {
        const direction = String(updateData.direction).toUpperCase();
        if (
          direction !== DomainTransactionDirection.INFLOW &&
          direction !== DomainTransactionDirection.OUTFLOW &&
          direction !== DomainTransactionDirection.TRANSFER
        ) {
          throw new Error("Direção inválida");
        }
        updateData.direction = direction;
        overrides.direction = direction;
      }

      if (Object.keys(overrides).length > 0) {
        updateData.metadataJson = JSON.stringify({
          ...currentMetadata,
          overrides,
        });
      }

      const updated = await tx.domainTransaction.update({
        where: { id: transactionId },
        data: updateData,
      });

      if ("ignored" in updateData) {
        if (updateData.ignored === true) {
          await tx.ignoredTransaction.upsert({
            where: { domainTransactionId: transactionId },
            create: {
              domainTransactionId: transactionId,
              reason: body.ignoreReason ?? null,
            },
            update: {
              reason: body.ignoreReason ?? null,
            },
          });
        } else {
          await tx.ignoredTransaction.deleteMany({
            where: { domainTransactionId: transactionId },
          });
        }
      }

      return updated;
    });

    return jsonOk({
      results: transaction,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ transactionId: string }> },
) {
  try {
    const { transactionId } = await params;

    const existing = await prisma.domainTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!existing) {
      return jsonError(new Error("Transação não encontrada"), 404);
    }

    if (existing.sourceProvider !== "MANUAL") {
      return jsonError(
        new Error(
          "Apenas transações manuais podem ser excluídas por este endpoint. Transações sincronizadas de provedores externos devem ser mantidas.",
        ),
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      // Limpar tabelas associadas (se houver registros)
      await tx.ignoredTransaction.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      await tx.domainTransactionSource.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      await tx.transactionTag.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      // Excluir a transação propriamente dita
      await tx.domainTransaction.delete({
        where: { id: transactionId },
      });
    });

    return jsonOk({
      results: {
        id: transactionId,
        message: "Transação excluída com sucesso",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
