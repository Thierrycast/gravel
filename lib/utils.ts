import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildSearchParams(
  obj?: Record<string, string | number | boolean | undefined | null>,
): URLSearchParams {
  const params = new URLSearchParams()
  if (!obj) return params
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && v !== "") params.set(k, String(v))
  }
  return params
}
