import { DomainTransactionDirection } from "@prisma/client";

import { jsonError, jsonOk } from "@/lib/core/http";
import { getDomainAccounts } from "@/lib/domain/queries";
import { deriveInstitutionFromNames, getInstitutionLogo } from "@/lib/domain/utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await getDomainAccounts(searchParams);
    const accountIds = payload.results.map((account) => account.id);

    const activity = await prisma.domainTransaction.groupBy({
      by: ["domainAccountId"],
      where:
        accountIds.length > 0
          ? { domainAccountId: { in: accountIds }, ignored: false }
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

    // Group accounts by sourceParentId to derive the real institution name.
    // Each Pluggy item corresponds to one real bank connection, so all accounts
    // under the same item belong to the same institution.
    const groupNames = new Map<string, string[]>();
    for (const account of payload.results) {
      if (!account.sourceParentId) continue;
      const bucket = groupNames.get(account.sourceParentId) ?? [];
      bucket.push(account.name);
      groupNames.set(account.sourceParentId, bucket);
    }
    const groupInstitution = new Map<string, string | null>();
    for (const [parentId, names] of groupNames.entries()) {
      groupInstitution.set(parentId, deriveInstitutionFromNames(names));
    }

    const results = payload.results.map((account) => {
      let metadata: Record<string, unknown> = {};
      if (account.metadataJson) {
        try {
          metadata = JSON.parse(account.metadataJson) as Record<string, unknown>;
        } catch {}
      }
      const activityItem = activityMap.get(account.id);
      const spentItem = spentMap.get(account.id);

      // Prefer group-derived brand name; fall back to stored institutionName
      // (only if it's not a Pluggy internal name).
      const groupName = account.sourceParentId
        ? (groupInstitution.get(account.sourceParentId) ?? null)
        : null;
      const storedName =
        account.institutionName && !["Pluggy", "MeuPluggy", "PLUGGY"].includes(account.institutionName)
          ? account.institutionName
          : null;
      const institution = groupName ?? storedName ?? null;

      return {
        id: account.id,
        name: account.nickname ?? account.name,
        originalName: account.name,
        kind: account.kind,
        subtype:
          typeof metadata.subtype === "string" ? metadata.subtype : account.kind,
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
      summary: { total: payload.total },
      results,
      meta: { page: payload.page, pageSize: payload.pageSize },
    });
  } catch (error) {
    return jsonError(error);
  }
}
