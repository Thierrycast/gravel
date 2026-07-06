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
    name: "Terminal",
    description: "Mono minimalista. Sharp, neutro, acento ciano.",
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
    id: "obsidian",
    name: "Obsidian",
    description: "Premium dark. Serif display, dourado, sombras suaves.",
    typography: "Serif + Grotesk",
    corners: "Suaves",
    preview: {
      light: {
        bg: "oklch(0.97 0.01 50)",
        fg: "oklch(0.14 0.02 50)",
        primary: "oklch(0.35 0.08 55)",
        accent: "oklch(0.75 0.15 75)",
      },
      dark: {
        bg: "oklch(0.08 0.01 260)",
        fg: "oklch(0.92 0.02 50)",
        primary: "oklch(0.82 0.16 75)",
        accent: "oklch(0.72 0.18 75)",
      },
    },
  },
  {
    id: "neon-noir",
    name: "Neon Noir",
    description: "Terminal de trading. Preto absoluto, neon, glow.",
    typography: "Space Mono",
    corners: "Retos",
    preview: {
      light: {
        bg: "oklch(0.97 0 0)",
        fg: "oklch(0.1 0.02 300)",
        primary: "oklch(0.5 0.28 330)",
        accent: "oklch(0.65 0.22 200)",
      },
      dark: {
        bg: "oklch(0.04 0 0)",
        fg: "oklch(0.9 0.02 200)",
        primary: "oklch(0.75 0.32 330)",
        accent: "oklch(0.78 0.25 200)",
      },
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Navy profundo, electric blue. Tech e profissional.",
    typography: "Space Grotesk",
    corners: "Suaves",
    preview: {
      light: {
        bg: "oklch(0.96 0.02 220)",
        fg: "oklch(0.12 0.06 225)",
        primary: "oklch(0.5 0.2 235)",
        accent: "oklch(0.6 0.18 190)",
      },
      dark: {
        bg: "oklch(0.1 0.04 230)",
        fg: "oklch(0.92 0.02 200)",
        primary: "oklch(0.7 0.22 235)",
        accent: "oklch(0.72 0.18 190)",
      },
    },
  },
  {
    id: "warm-sand",
    name: "Warm Sand",
    description: "Creme, terracota. Diário financeiro pessoal.",
    typography: "Plus Jakarta Sans",
    corners: "Arredondados",
    preview: {
      light: {
        bg: "oklch(0.97 0.03 70)",
        fg: "oklch(0.18 0.04 40)",
        primary: "oklch(0.52 0.14 38)",
        accent: "oklch(0.72 0.16 65)",
      },
      dark: {
        bg: "oklch(0.14 0.03 40)",
        fg: "oklch(0.93 0.03 70)",
        primary: "oklch(0.72 0.16 55)",
        accent: "oklch(0.78 0.18 65)",
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
    <div className="relative sm:contents">
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

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
              "group relative flex min-w-[260px] flex-1 flex-col gap-3 rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/60 snap-center sm:min-w-0",
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
      {/* Scroll affordance gradient – only visible when cards overflow (mobile) */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-card to-transparent sm:hidden"
        aria-hidden
      />
    </div>
  )
}
