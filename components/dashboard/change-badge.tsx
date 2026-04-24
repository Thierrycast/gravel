import { cn } from "@/lib/utils"

export function ChangeBadge({
  value,
  reverse = false,
}: {
  value: number | null
  reverse?: boolean
}) {
  if (value == null || !Number.isFinite(value)) return null
  const positive = reverse ? value < 0 : value > 0
  const negative = reverse ? value > 0 : value < 0
  
  // Use strings instead of components for simplicity in server components if needed,
  // but since this is small it's fine.
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        positive ? "text-emerald-500 dark:text-emerald-400" : 
        negative ? "text-rose-500 dark:text-rose-400" : 
        "text-muted-foreground"
      )}
    >
      {value >= 0 ? "↑" : "↓"}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}
