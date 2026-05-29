"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type ChartMode = "comparativo" | "cashFlow" | "categories";

export function useDashboardFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showSalary, setShowSalary] = useState(
    searchParams.get("showFutureSalary") !== "false",
  );
  const [showFuture, setShowFuture] = useState(
    searchParams.get("showFutureAccounts") !== "false",
  );
  const [chartMode, setChartMode] = useState<ChartMode>("comparativo");

  function updateParam(key: string, value: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, String(value));
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return {
    showSalary,
    setShowSalary: (val: boolean) => {
      setShowSalary(val);
      updateParam("showFutureSalary", val);
    },
    showFuture,
    setShowFuture: (val: boolean) => {
      setShowFuture(val);
      updateParam("showFutureAccounts", val);
    },
    chartMode,
    setChartMode,
  };
}
