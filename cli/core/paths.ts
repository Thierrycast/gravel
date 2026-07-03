import path from "node:path"
import { fileURLToPath } from "node:url"

// Resolve o diretório do módulo tanto em ESM (tsx: import.meta.url) quanto no
// bundle CJS do esbuild (Docker), onde import.meta.url fica indefinido — aí
// caímos para process.cwd().
function resolveModuleDir(): string {
  try {
    const url = import.meta.url
    if (url) return path.dirname(fileURLToPath(url))
  } catch {
    // import.meta indisponível no bundle CJS.
  }
  return process.cwd()
}

const moduleDir = resolveModuleDir()

// No bundle (cwd = raiz do app) não há "../.."; usa o cwd direto.
export const PROJECT_ROOT = moduleDir === process.cwd()
  ? moduleDir
  : path.resolve(moduleDir, "../..")
export const PRISMA_SCHEMA = path.join(PROJECT_ROOT, "prisma/schema.prisma")
export const ENV_FILE = path.join(PROJECT_ROOT, ".env")
export const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, ".ai/runs")
