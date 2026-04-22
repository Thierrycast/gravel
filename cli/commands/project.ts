import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"

import { log } from "../core/logger.js"
import { PROJECT_ROOT } from "../core/paths.js"

interface ProjectContextOptions {
  out?: string
  format: "bundle" | "md" | "json"
}

interface ApiRoute {
  route: string
  file: string
  methods: string[]
}

interface ProjectContext {
  metadata: {
    generatedAt: string
    projectRoot: string
  }
  pkg: {
    name?: string
    version?: string
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  prismaModels: string[]
  apiRoutes: ApiRoute[]
  pages: string[]
  docs: Array<{ file: string; bytes: number; firstLine: string }>
  modules: Array<{ file: string; exports: string[] }>
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T
  } catch {
    return null
  }
}

function walk(dir: string, predicate: (entry: string, stat: ReturnType<typeof statSync>) => boolean): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".git")) continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...walk(full, predicate))
    } else if (predicate(full, st)) {
      out.push(full)
    }
  }
  return out
}

function extractPrismaModels(schemaPath: string): string[] {
  try {
    const text = readFileSync(schemaPath, "utf-8")
    const matches = text.matchAll(/^model\s+(\w+)\s*\{/gm)
    return Array.from(matches, (m) => m[1]).sort()
  } catch {
    return []
  }
}

function extractApiRoutes(): ApiRoute[] {
  const apiDir = path.join(PROJECT_ROOT, "app/api")
  const files = walk(apiDir, (entry) => entry.endsWith("/route.ts") || entry.endsWith("/route.js"))
  return files
    .map((file) => {
      const rel = path.relative(apiDir, path.dirname(file))
      const route = "/api/" + rel.replace(/\\/g, "/")
      let methods: string[] = []
      try {
        const text = readFileSync(file, "utf-8")
        const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
        methods = httpMethods.filter((m) => new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(text))
      } catch {
        /* noop */
      }
      return { route, file: path.relative(PROJECT_ROOT, file), methods }
    })
    .sort((a, b) => a.route.localeCompare(b.route))
}

function extractPages(): string[] {
  const appDir = path.join(PROJECT_ROOT, "app")
  const files = walk(appDir, (entry) => entry.endsWith("/page.tsx") || entry.endsWith("/page.ts"))
  return files
    .map((f) => {
      const rel = path.relative(appDir, path.dirname(f))
      return "/" + rel.replace(/\\/g, "/")
    })
    .sort()
}

function extractDocs(): Array<{ file: string; bytes: number; firstLine: string }> {
  const docsDir = path.join(PROJECT_ROOT, "docs")
  const files = walk(docsDir, (entry) => entry.endsWith(".md"))
  return files
    .map((file) => {
      const text = readFileSync(file, "utf-8")
      const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? ""
      return {
        file: path.relative(PROJECT_ROOT, file),
        bytes: text.length,
        firstLine: firstLine.replace(/^#+\s*/, "").slice(0, 120),
      }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

function extractModuleExports(): Array<{ file: string; exports: string[] }> {
  const libDir = path.join(PROJECT_ROOT, "lib/domain")
  const files = walk(libDir, (entry) => entry.endsWith(".ts"))
  return files
    .map((file) => {
      const text = readFileSync(file, "utf-8")
      const matches = text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/gm)
      const exports = Array.from(matches, (m) => m[1])
      return { file: path.relative(PROJECT_ROOT, file), exports }
    })
    .sort((a, b) => a.file.localeCompare(b.file))
}

function buildContext(): ProjectContext {
  const pkg =
    readJson<{
      name?: string
      version?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }>(path.join(PROJECT_ROOT, "package.json")) ?? {}

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      projectRoot: PROJECT_ROOT,
    },
    pkg: {
      name: pkg.name,
      version: pkg.version,
      scripts: pkg.scripts,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies,
    },
    prismaModels: extractPrismaModels(path.join(PROJECT_ROOT, "prisma/schema.prisma")),
    apiRoutes: extractApiRoutes(),
    pages: extractPages(),
    docs: extractDocs(),
    modules: extractModuleExports(),
  }
}

function renderMarkdown(ctx: ProjectContext): string {
  const lines: string[] = []
  lines.push(`# Gravel - Contexto tecnico do projeto`)
  lines.push("")
  lines.push(`> Gerado em ${ctx.metadata.generatedAt}`)
  lines.push("")
  lines.push(`## Pacote`)
  lines.push("")
  lines.push(`- **Nome:** ${ctx.pkg.name ?? "?"}`)
  lines.push(`- **Versao:** ${ctx.pkg.version ?? "?"}`)
  lines.push("")
  lines.push(`## Scripts`)
  lines.push("")
  for (const [k, v] of Object.entries(ctx.pkg.scripts ?? {})) {
    lines.push(`- \`${k}\`: ${v}`)
  }
  lines.push("")
  lines.push(`## Modelos Prisma (${ctx.prismaModels.length})`)
  lines.push("")
  for (const model of ctx.prismaModels) lines.push(`- ${model}`)
  lines.push("")
  lines.push(`## Rotas de API (${ctx.apiRoutes.length})`)
  lines.push("")
  for (const route of ctx.apiRoutes) {
    const methods = route.methods.length ? `[${route.methods.join(", ")}]` : "[?]"
    lines.push(`- \`${route.route}\` ${methods} - ${route.file}`)
  }
  lines.push("")
  lines.push(`## Paginas (${ctx.pages.length})`)
  lines.push("")
  for (const page of ctx.pages) lines.push(`- ${page}`)
  lines.push("")
  lines.push(`## Modulos de dominio`)
  lines.push("")
  for (const mod of ctx.modules) {
    lines.push(`### ${mod.file}`)
    lines.push("")
    if (mod.exports.length === 0) {
      lines.push("(sem exports nomeados)")
    } else {
      for (const e of mod.exports) lines.push(`- ${e}`)
    }
    lines.push("")
  }
  lines.push(`## Documentos (${ctx.docs.length})`)
  lines.push("")
  for (const doc of ctx.docs) {
    lines.push(`- \`${doc.file}\` (${doc.bytes}B): ${doc.firstLine}`)
  }
  lines.push("")
  return lines.join("\n")
}

export const projectCommand = new Command("project").description(
  "Coleta de contexto tecnico do projeto para agentes"
)

projectCommand
  .command("context")
  .description("Gera contexto tecnico do projeto (modulos, rotas, schemas, docs)")
  .option("-o, --out <dir>", "Diretorio de saida (default .ai/project-context)")
  .option("--format <fmt>", "Formato (bundle|md|json)", "bundle")
  .action((options: ProjectContextOptions) => {
    const outDir = path.resolve(options.out ?? path.join(PROJECT_ROOT, ".ai/project-context"))
    mkdirSync(outDir, { recursive: true })

    log.heading("Gravel Project Context")
    log.info("Coletando contexto do projeto...")
    const ctx = buildContext()

    if (options.format === "json" || options.format === "bundle") {
      const jsonPath = path.join(outDir, "project-context.json")
      writeFileSync(jsonPath, JSON.stringify(ctx, null, 2))
      log.success(`JSON: ${jsonPath}`)
    }

    if (options.format === "md" || options.format === "bundle") {
      const mdPath = path.join(outDir, "project-context.md")
      writeFileSync(mdPath, renderMarkdown(ctx))
      log.success(`Markdown: ${mdPath}`)
    }

    log.dim(
      `  ${ctx.prismaModels.length} models, ${ctx.apiRoutes.length} rotas, ${ctx.pages.length} paginas, ${ctx.docs.length} docs`
    )
  })
