import Link from "next/link"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

export function StatTile({
  label,
  value,
  icon: Icon,
  hint,
  href,
  loading,
  tone = "neutral",
  delta,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  href?: string
  loading?: boolean
  tone?: "neutral" | "positive" | "negative" | "info"
  delta?: React.ReactNode
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-positive",
    negative: "text-negative",
    info: "text-info",
  }[tone]

  const Wrapper: React.ElementType = href ? Link : "div"
  const wrapperProps = href ? { href } : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={cn(
        "surface @container flex min-w-0 flex-col gap-2 p-4 transition-colors",
        href && "hover:bg-accent/40"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="section-eyebrow">{label}</p>
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        // Fonte proporcional à largura do card: em duas colunas num celular de
        // 390 px, "R$ 13.169,68" em text-2xl passava da borda.
        <p
          className={cn(
            "whitespace-nowrap text-[clamp(1rem,12.5cqi,1.5rem)] font-bold tabular-nums tracking-tighter",
            toneClass,
          )}
        >
          {value}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {hint ? <span className="truncate">{hint}</span> : <span />}
        {delta}
      </div>
    </Wrapper>
  )
}