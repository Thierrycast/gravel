export type ThemeMode = "light" | "dark"
export type ThemeFamily = "default" | "cyberpunk" | "emerald"

export const THEME_FAMILIES: ThemeFamily[] = ["default", "cyberpunk", "emerald"]

export const NEXT_THEMES_REGISTRY = [
  "light",
  "dark",
  "cyberpunk-light",
  "cyberpunk-dark",
  "emerald-light",
  "emerald-dark",
] as const

export function getMode(theme: string | undefined | null): ThemeMode {
  if (!theme) return "light"
  if (theme === "dark" || theme.endsWith("-dark")) return "dark"
  return "light"
}

export function getFamily(theme: string | undefined | null): ThemeFamily {
  if (!theme || theme === "light" || theme === "dark" || theme === "system") {
    return "default"
  }
  const base = theme.replace(/-(light|dark)$/, "")
  if (base === "cyberpunk" || base === "emerald") return base
  return "default"
}

export function buildTheme(family: ThemeFamily, mode: ThemeMode): string {
  return family === "default" ? mode : `${family}-${mode}`
}
