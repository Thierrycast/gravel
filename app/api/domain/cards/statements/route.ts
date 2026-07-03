import { jsonError, jsonOk } from "@/lib/core/http";
import { getCardStatements } from "@/lib/domain/billing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") ?? undefined;
    const results = await getCardStatements({ accountId });
    return jsonOk({ results });
  } catch (error) {
    return jsonError(error);
  }
}
