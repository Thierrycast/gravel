export type ThemeMode = "light" | "dark"
export type ThemeFamily = "default" | "obsidian" | "neon-noir" | "ocean" | "warm-sand"

export const THEME_FAMILIES: ThemeFamily[] = ["default", "obsidian", "neon-noir", "ocean", "warm-sand"]

export const NEXT_THEMES_REGISTRY = [
  "light",
  "dark",
  "obsidian-light",
  "obsidian-dark",
  "neon-noir-light",
  "neon-noir-dark",
  "ocean-light",
  "ocean-dark",
  "warm-sand-light",
  "warm-sand-dark",
] as const

export function getMode(theme: string | undefined | null): ThemeMode {
  if (!theme) return "light"
  if (theme === "dark" || theme.endsWith("-dark")) return "dark"
  return "light"
}

export function getFamily(theme: string | undefined | null): ThemeFamily {
  if (!theme || theme === "light" || theme === "dark" || theme === "system") return "default"
  const base = theme.replace(/-(light|dark)$/, "") as ThemeFamily
  if (THEME_FAMILIES.includes(base)) return base
  return "default"
}

export function buildTheme(family: ThemeFamily, mode: ThemeMode): string {
  return family === "default" ? mode : `${family}-${mode}`
}
