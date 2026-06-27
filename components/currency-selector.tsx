"use client"

import { useCurrency, type Currency } from "@/lib/currency-context"
import { cn } from "@/lib/utils"

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency()

  return (
    <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5 font-mono text-xs font-bold tracking-tighter">
      {(["BRL", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          onClick={() => setCurrency(c)}
          aria-label={`Selecionar moeda ${c}`}
          className={cn(
            "flex h-8 w-10 items-center justify-center rounded-[4px] transition-all duration-200",
            currency === c
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  )
}

