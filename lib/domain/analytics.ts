import { buildMetricFilters } from "./analytics/shared";

export * from "./analytics/shared";
export * from "./analytics/overview";
export * from "./analytics/cash-flow";
export * from "./analytics/portfolio";
export * from "./analytics/scenarios";
export * from "./analytics/reports";

export function parseMetricQuery(
  searchParams: URLSearchParams,
  defaults?: {
    period?: string;
    groupBy?: import("./analytics/shared").MetricFilters["groupBy"];
    limit?: number;
  },
) {
  return buildMetricFilters(searchParams, defaults);
}