"use client"

import { Calendar } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PERIOD_OPTIONS, type PeriodKey, type PeriodState } from "@/hooks/use-period"
import { cn } from "@/lib/utils"

interface PeriodSwitcherProps {
  state: PeriodState
  className?: string
  /** Subset of period options to display. Defaults to all. */
  options?: PeriodKey[]
}

export function PeriodSwitcher({ state, className, options }: PeriodSwitcherProps) {
  const visible = options
    ? PERIOD_OPTIONS.filter((option) => options.includes(option.value))
    : PERIOD_OPTIONS

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs font-medium", className)}
        >
          <Calendar className="size-3.5 text-muted-foreground" />
          <span className="tabular-nums">{state.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Período
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visible.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => state.setPeriod(option.value)}
            className={cn(
              "text-sm",
              state.period === option.value && "bg-accent font-medium"
            )}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
