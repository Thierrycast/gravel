import { prisma } from "@/lib/prisma";

/**
 * `domainAccountId → kind`, para o classificador saber quando uma entrada caiu
 * num cartão (quitação/estorno, nunca renda).
 */
export async function loadAccountKinds(): Promise<Map<string, string>> {
  const accounts = await prisma.domainAccount.findMany({
    select: { id: true, kind: true },
  });
  return new Map(accounts.map((account) => [account.id, account.kind]));
}

export function accountKindOf(
  kinds: Map<string, string>,
  accountId?: string | null,
): string | null {
  return accountId ? (kinds.get(accountId) ?? null) : null;
}
