"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPercent } from "@/lib/format";

/**
 * Selo de variação percentual contra o período anterior.
 *
 * Mora aqui — e não na página — porque os cards de gráfico o renderizam no
 * próprio cabeçalho; deixá-lo na página obrigaria a passá-lo como `ReactNode`
 * por prop só para evitar a duplicação.
 *
 * `invertColors` existe para despesas: ali *subir* é ruim, então o verde/vermelho
 * precisa andar ao contrário do sinal do número.
 */
export function ChangeBadge({
  value,
  invertColors = false,
}: {
  value: number | null | undefined;
  invertColors?: boolean;
}) {
  if (value == null) return null;

  const isPositive = invertColors ? value <= 0 : value >= 0;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        isPositive
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      }`}
    >
      <Icon className="size-3" />
      {formatPercent(Math.abs(value))}
    </span>
  );
}
