import { DomainTransactionDirection } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/core/http";
import { getDomainAccounts } from "@/lib/domain/queries";
import { getInstitutionLogo } from "@/lib/domain/utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await getDomainAccounts(searchParams);
    const accountIds = payload.results.map((account) => account.id);
    const pluggyItemIds = Array.from(
      new Set(
        payload.results
          .map((account) => account.sourceParentId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const pluggyItems = await prisma.pluggyItem.findMany({
      where:
        pluggyItemIds.length > 0
          ? { pluggyItemId: { in: pluggyItemIds } }
          : { id: "__none__" },
      select: { pluggyItemId: true, connectorName: true },
    });
    const pluggyItemMap = new Map(
      pluggyItems.map((item) => [item.pluggyItemId, item]),
    );
    const activity = await prisma.domainTransaction.groupBy({
      by: ["domainAccountId"],
      where:
        accountIds.length > 0
          ? {
              domainAccountId: { in: accountIds },
              ignored: false,
            }
          : { id: "__none__" },
      _count: true,
      _sum: { amount: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    });
    const spentActivity = await prisma.domainTransaction.groupBy({
      by: ["domainAccountId"],
      where:
        accountIds.length > 0
          ? {
              domainAccountId: { in: accountIds },
              direction: DomainTransactionDirection.OUTFLOW,
              ignored: false,
            }
          : { id: "__none__" },
      _count: true,
      _sum: { amount: true },
    });
    const activityMap = new Map(
      activity
        .filter((item) => item.domainAccountId)
        .map((item) => [item.domainAccountId, item]),
    );
    const spentMap = new Map(
      spentActivity
        .filter((item) => item.domainAccountId)
        .map((item) => [item.domainAccountId, item]),
    );
    const results = payload.results.map((account) => {
      let metadata: Record<string, unknown> = {};
      if (account.metadataJson) {
        try {
          metadata = JSON.parse(account.metadataJson) as Record<
            string,
            unknown
          >;
        } catch {}
      }
      const activityItem = activityMap.get(account.id);
      const spentItem = spentMap.get(account.id);
      const pluggyItem = account.sourceParentId
        ? pluggyItemMap.get(account.sourceParentId)
        : null;
      // connectorName is the real bank name (e.g. "Nubank", "Itaú").
      // Never expose "PLUGGY" — it is our sync provider, not a financial institution.
      const connectorName = pluggyItem?.connectorName ?? null;
      const institution =
        connectorName ??
        (account.institutionName !== "Pluggy"
          ? account.institutionName
          : null) ??
        null;

      return {
        id: account.id,
        name: account.nickname ?? account.name,
        originalName: account.name,
        kind: account.kind,
        subtype:
          typeof metadata.subtype === "string"
            ? metadata.subtype
            : account.kind,
        balance: account.balance ?? 0,
        currencyCode: account.currencyCode,
        institution,
        number: account.sourceExternalId,
        providerAccountId: account.sourceExternalId,
        sourceProvider: account.sourceProvider,
        sourceParentId: account.sourceParentId,
        ownerName: account.ownerName,
        nickname: account.nickname,
        imageUrl: getInstitutionLogo(institution ?? account.name),
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        transactionCount: activityItem?._count ?? 0,
        totalSpent: spentItem?._sum.amount?.abs() ?? 0,
        firstTransactionAt: activityItem?._min.occurredAt ?? null,
        lastTransactionAt: activityItem?._max.occurredAt ?? null,
      };
    });

    return jsonOk({
      summary: {
        total: payload.total,
      },
      results,
      meta: {
        page: payload.page,
        pageSize: payload.pageSize,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
