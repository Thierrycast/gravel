"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import {
  buildTheme,
  getFamily,
  getMode,
  type ThemeFamily,
} from "@/lib/theme"

type FamilyCard = {
  id: ThemeFamily
  name: string
  description: string
  typography: string
  corners: string
  preview: {
    light: { bg: string; fg: string; primary: string; accent: string }
    dark: { bg: string; fg: string; primary: string; accent: string }
  }
}

const FAMILIES: FamilyCard[] = [
  {
    id: "default",
    name: "Padrão",
    description:
      "Terminal minimalista. Mono, cantos retos, paleta neutra com acento ciano.",
    typography: "Monospace",
    corners: "Retos",
    preview: {
      light: {
        bg: "oklch(0.99 0.002 260)",
        fg: "oklch(0.18 0.01 260)",
        primary: "oklch(0.22 0.01 260)",
        accent: "oklch(0.62 0.18 260)",
      },
      dark: {
        bg: "oklch(0.12 0 0)",
        fg: "oklch(0.85 0 0)",
        primary: "oklch(0.85 0.15 200)",
        accent: "oklch(0.70 0.20 150)",
      },
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description:
      "Synthwave: magenta neon sobre violeta com acentos ciano elétrico.",
    typography: "Monospace",
    corners: "Retos",
    preview: {
      light: {
        bg: "oklch(0.97 0.02 320)",
        fg: "oklch(0.2 0.08 320)",
        primary: "oklch(0.5 0.24 330)",
        accent: "oklch(0.52 0.2 220)",
      },
      dark: {
        bg: "oklch(0.1 0.03 320)",
        fg: "oklch(0.92 0.04 200)",
        primary: "oklch(0.7 0.27 330)",
        accent: "oklch(0.8 0.15 200)",
      },
    },
  },
  {
    id: "emerald",
    name: "Esmeralda",
    description:
      "Orgânico e calmo: verdes de floresta, âmbar quente, sans-serif e cantos suaves.",
    typography: "Sans-serif",
    corners: "Arredondados",
    preview: {
      light: {
        bg: "oklch(0.98 0.01 80)",
        fg: "oklch(0.2 0.04 155)",
        primary: "oklch(0.48 0.12 155)",
        accent: "oklch(0.65 0.14 70)",
      },
      dark: {
        bg: "oklch(0.16 0.02 155)",
        fg: "oklch(0.92 0.02 80)",
        primary: "oklch(0.72 0.13 150)",
        accent: "oklch(0.78 0.18 75)",
      },
    },
  },
]

export function ThemePicker() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const active = resolvedTheme ?? theme
  const currentFamily = getFamily(active)
  const currentMode = getMode(active)

  const pick = (family: ThemeFamily) => {
    setTheme(buildTheme(family, currentMode))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FAMILIES.map((family) => {
        const preview = family.preview[currentMode]
        const isActive = mounted && currentFamily === family.id
        return (
          <button
            key={family.id}
            type="button"
            onClick={() => pick(family.id)}
            aria-pressed={isActive}
            className={cn(
              "group relative flex flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/60",
              isActive
                ? "border-primary ring-2 ring-primary/30"
                : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{family.name}</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {family.description}
                </div>
              </div>
              {isActive && (
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </div>
              )}
            </div>

            {/* Mini mock of a card in this theme */}
            <div
              className="flex flex-col gap-2 rounded-md border p-2.5"
              style={{
                backgroundColor: preview.bg,
                borderColor: `color-mix(in oklab, ${preview.fg} 18%, transparent)`,
                color: preview.fg,
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="h-1.5 w-10 rounded-sm"
                  style={{ backgroundColor: preview.fg, opacity: 0.6 }}
                />
                <div
                  className="size-2 rounded-full"
                  style={{ backgroundColor: preview.accent }}
                />
              </div>
              <div className="flex items-end gap-1.5">
                <div
                  className="h-6 w-5 rounded-sm"
                  style={{ backgroundColor: preview.primary }}
                />
                <div
                  className="h-4 w-5 rounded-sm"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${preview.primary} 55%, transparent)`,
                  }}
                />
                <div
                  className="h-3 w-5 rounded-sm"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${preview.accent} 70%, transparent)`,
                  }}
                />
                <div
                  className="h-5 w-5 rounded-sm"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${preview.fg} 25%, transparent)`,
                  }}
                />
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between pt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{family.typography}</span>
              <span>{family.corners}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
