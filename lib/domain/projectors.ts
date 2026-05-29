import { SourceProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export * from "./projectors/shared";
export * from "./projectors/pluggy";
export * from "./projectors/binance";

import { ensureDefaultCategories } from "./projectors/shared";
import { projectPluggyReadModels, projectPluggyAccounts, projectPluggyTransactions } from "./projectors/pluggy";
import { projectBinanceReadModels } from "./projectors/binance";

export async function rebuildAllDomainReadModels() {
  await ensureDefaultCategories();

  const [pluggy, binance] = await Promise.all([
    projectPluggyReadModels(),
    projectBinanceReadModels(),
  ]);

  return {
    pluggy,
    binance,
  };
}

export async function reprocessProviderRecord(input: {
  provider: SourceProvider;
  resource: string;
  externalId: string;
}) {
  if (input.provider === SourceProvider.PLUGGY) {
    switch (input.resource) {
      case "transaction": {
        const record = await prisma.pluggyTransactionRecord.findUnique({
          where: { externalId: input.externalId },
        });
        if (!record) throw new Error("Pluggy record not found");
        await projectPluggyTransactions();
        return {
          provider: "PLUGGY",
          resource: "transaction",
          externalId: record.externalId,
        };
      }
      case "account": {
        const record = await prisma.pluggyAccountRecord.findUnique({
          where: { externalId: input.externalId },
        });
        if (!record) throw new Error("Pluggy record not found");
        await projectPluggyAccounts();
        return {
          provider: "PLUGGY",
          resource: "account",
          externalId: record.externalId,
        };
      }
      default:
        throw new Error(
          "Pluggy reprocessing not supported for this resource",
        );
    }
  }

  if (input.provider === SourceProvider.BINANCE) {
    switch (input.resource) {
      case "trade":
      case "asset":
        await projectBinanceReadModels();
        return {
          provider: "BINANCE",
          resource: input.resource,
          externalId: input.externalId,
        };
      default:
        throw new Error(
          "Binance reprocessing not supported for this resource",
        );
    }
  }

  throw new Error("Provider not supported");
}