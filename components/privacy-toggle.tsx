"use client"

import { Eye, EyeOff } from "lucide-react"
import { useCurrency } from "@/lib/currency-context"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function PrivacyToggle() {
  const { isPrivate, setIsPrivate } = useCurrency()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 text-muted-foreground hover:text-foreground"
          onClick={() => setIsPrivate(!isPrivate)}
        >
          {isPrivate ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs font-mono">
        {isPrivate ? "Mostrar valores" : "Ocultar valores"}
      </TooltipContent>
    </Tooltip>
  )
}
