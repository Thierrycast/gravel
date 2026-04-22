import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const PROJECT_ROOT = path.resolve(__dirname, "../..")
export const PRISMA_SCHEMA = path.join(PROJECT_ROOT, "prisma/schema.prisma")
export const ENV_FILE = path.join(PROJECT_ROOT, ".env")
export const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, ".ai/runs")
