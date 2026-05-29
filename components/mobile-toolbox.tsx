"use client"

import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { ModeToggle } from "@/components/mode-toggle"
import { PrivacyToggle } from "@/components/privacy-toggle"
import { CurrencySelector } from "@/components/currency-selector"
import { SyncButton } from "@/components/sync-button"

export function MobileToolbox() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Abrir ajustes rápidos"
        >
          <SlidersHorizontal className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] sm:w-[320px]">
        <SheetHeader>
          <SheetTitle>Ajustes rápidos</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Tema
            </span>
            <ModeToggle />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Privacidade
            </span>
            <PrivacyToggle />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Moeda
            </span>
            <CurrencySelector />
          </div>
          <div className="flex flex-col items-stretch gap-2 rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Sincronizar
              </span>
              <span className="text-[11px] text-muted-foreground">manual</span>
            </div>
            <SyncButton showTime className="w-full" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
