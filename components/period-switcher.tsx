"use client"

import { useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PERIOD_OPTIONS, type PeriodKey, type PeriodState } from "@/hooks/use-period"
import { cn } from "@/lib/utils"

interface PeriodSwitcherProps {
  state: PeriodState
  className?: string
  /** Subset of period options to display. Defaults to all. */
  options?: PeriodKey[]
}

export function PeriodSwitcher({ state, className, options }: PeriodSwitcherProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [tempFrom, setTempFrom] = useState("")
  const [tempTo, setTempTo] = useState("")



  const visible = options
    ? PERIOD_OPTIONS.filter((option) => options.includes(option.value))
    : PERIOD_OPTIONS

  return (
    <>
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
          <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setTempFrom(state.from ?? "")
              setTempTo(state.to ?? "")
              setIsCustomOpen(true)
            }}
            className={cn(
              "text-sm font-medium text-primary cursor-pointer",
              state.period === "custom" && "bg-accent font-semibold"
            )}
          >
            Personalizado...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Período Personalizado</DialogTitle>
            <DialogDescription>
              Selecione o intervalo de datas desejado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="from" className="text-left font-medium">
                De
              </Label>
              <Input
                id="from"
                type="date"
                value={tempFrom}
                onChange={(e) => setTempFrom(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="to" className="text-left font-medium">
                Até
              </Label>
              <Input
                id="to"
                type="date"
                value={tempTo}
                onChange={(e) => setTempTo(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCustomOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                state.setRange(tempFrom, tempTo)
                setIsCustomOpen(false)
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}