import { DomainCategoryKind, DomainTransactionDirection, SourceProvider } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { jsonOk, jsonError } from "@/lib/core/http";
import { ensureRecurringDerivedFresh } from "@/lib/domain/derived";
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

async function findOrCreateSalaryCategory() {
  const existing = await prisma.domainCategory.findFirst({
    where: {
      OR: [
        { slug: "seed-salary" },
        { name: { contains: "salario" } },
        { name: { contains: "salário" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.domainCategory.create({
    data: {
      slug: "seed-salary",
      name: "Salário",
      kind: DomainCategoryKind.INCOME,
      color: "#10b981",
      sourceProvider: SourceProvider.MANUAL,
    },
  });
}

async function findOrCreateInvestmentCategory() {
  const existing = await prisma.domainCategory.findFirst({
    where: {
      OR: [
        { slug: "seed-investments" },
        { name: { contains: "investimento" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) return existing;

  return prisma.domainCategory.create({
    data: {
      slug: "seed-investments",
      name: "Investimentos",
      kind: DomainCategoryKind.EXPENSE,

      color: "#f59e0b",
      sourceProvider: SourceProvider.MANUAL,
    },
  });
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

    let salaryPatternAdded = false;

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

    // Categoria escolhida pelo usuário é MANUAL — o enriquecimento da Pluggy
    // não pode sobrescrevê-la depois.
    if ("domainCategoryId" in body && body.domainCategoryId) {
      updateData.categorySource = "MANUAL";
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

    if (body.markAsSalary === true) {
      if (existing.direction !== DomainTransactionDirection.INFLOW) {
        return jsonError(
          new Error("Apenas transações de entrada podem ser marcadas como salário"),
          400,
        );
      }

      const salaryCategory = await findOrCreateSalaryCategory();
      updateData.direction = DomainTransactionDirection.INFLOW;
      updateData.domainCategoryId = salaryCategory.id;
    }

    if (body.markAsInvestment === true) {
      const investmentCategory = await findOrCreateInvestmentCategory();
      updateData.direction = DomainTransactionDirection.OUTFLOW;
      updateData.domainCategoryId = investmentCategory.id;
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

      if ("domainCategoryId" in updateData && updateData.domainCategoryId) {
        const assignedCategory = await tx.domainCategory.findUnique({
          where: { id: String(updateData.domainCategoryId) },
        });
        if (
          assignedCategory &&
          (assignedCategory.slug === "seed-salary" ||
            assignedCategory.name.toLowerCase() === "salario" ||
            assignedCategory.name.toLowerCase() === "salário")
        ) {
          const userSetting = await tx.userSetting.upsert({
            where: { id: "default" },
            update: {},
            create: { id: "default" },
          });
          let config: Record<string, unknown> = {};
          if (userSetting.dashboardConfigJson) {
            try {
              config = JSON.parse(userSetting.dashboardConfigJson) as Record<string, unknown>;
            } catch {}
          }
          const patterns = Array.isArray(config.salaryPatterns)
            ? (config.salaryPatterns as string[]).filter(
                (pattern) => typeof pattern === "string",
              )
            : [];
          const term = existing.description ? existing.description.trim() : "";
          // Pagamento de fatura nunca vira padrão de salário — um padrão
          // genérico como "Pagamento recebido" transformaria toda entrada de
          // cartão em renda.
          const looksLikeCardPayment =
            /pagamento\s*(recebido|de\s*fatura|efetuado)|pagto\.?\s*(de)?\s*fatura/i.test(
              term,
            );
          if (term && !looksLikeCardPayment && !patterns.includes(term)) {
            patterns.push(term);
            config.salaryPatterns = patterns;
            await tx.userSetting.update({
              where: { id: "default" },
              data: {
                dashboardConfigJson: JSON.stringify(config),
              },
            });
            salaryPatternAdded = true;
          }
        }
      }

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

    if (salaryPatternAdded) {
      // Novo padrão de salário: re-detecta recorrências para a renda aparecer
      // em receitas recorrentes e na projeção sem esperar o throttle.
      await ensureRecurringDerivedFresh({ force: true });
    }

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
      
      await tx.ignoredTransaction.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      await tx.domainTransactionSource.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      await tx.transactionTag.deleteMany({
        where: { domainTransactionId: transactionId },
      });

      
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
