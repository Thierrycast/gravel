import { jsonError, jsonOk } from "@/lib/core/http";
import { getCashFlowMetrics } from "@/lib/domain/analytics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const months = searchParams.get("months");
    if (months && !searchParams.has("period")) {
      const days = Number(months) * 30;
      searchParams.set("period", `${days}d`);
    }

    const group = searchParams.get("group");
    if (group && !searchParams.has("groupBy")) {
      searchParams.set("groupBy", group);
    }

    const results = await getCashFlowMetrics(searchParams);

    const mapped = results.map((item) => ({
      date: item.period,
      income: item.inflow,
      expense: item.outflow,
      investments: item.investments,
      net: item.net,
      transactions: item.transactions,
    }));

    return jsonOk({
      summary: {
        points: results.length,
      },
      results: mapped,
    });
  } catch (error) {
    return jsonError(error);
  }
}
