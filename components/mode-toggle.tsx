"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { buildTheme, getFamily, getMode } from "@/lib/theme"

export function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const active = resolvedTheme ?? theme
  const mode = getMode(active)
  const family = getFamily(active)

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-foreground"
        aria-label="Carregando tema"
      >
        <Sun className="size-4" />
      </Button>
    )
  }

  const toggle = () => {
    setTheme(buildTheme(family, mode === "dark" ? "light" : "dark"))
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="size-8 text-muted-foreground hover:text-foreground"
      aria-label={mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Alternar modo claro/escuro</span>
    </Button>
  )
}
