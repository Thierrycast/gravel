import { Command } from "commander"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { log } from "../core/logger.js"

type ClaudeDesktopConfig = {
  mcpServers?: Record<string, unknown>
  [key: string]: unknown
}

export const mcpCommand = new Command("mcp").description(
  "Instalação e gerenciamento do MCP Server"
)

mcpCommand
  .command("install")
  .description("Instala o Gravel MCP Server no Claude Desktop e cria a Skill para Codex/Antigravity")
  .option("--claude-only", "Instala apenas no Claude Desktop")
  .option("--skill-only", "Cria apenas a Skill local")
  .action(async (options) => {
    const cwd = process.cwd()
    const isWindows = os.platform() === "win32"
    
    // 1. Claude Desktop installation
    if (!options.skillOnly) {
      let configDir = ""
      if (isWindows) {
        configDir = path.join(process.env.APPDATA || "", "Claude")
      } else {
        configDir = path.join(os.homedir(), "Library", "Application Support", "Claude")
      }
      
      const configPath = path.join(configDir, "claude_desktop_config.json")
      log.info(`Localizando Claude Desktop config em: ${configPath}`)
      
      let config: ClaudeDesktopConfig = { mcpServers: {} }
      
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, "utf-8")
          config = JSON.parse(content)
          if (!config.mcpServers) config.mcpServers = {}
        } catch {
          log.warn("Falha ao ler arquivo existente do Claude Desktop, criando novo.")
        }
      } else {
        log.info("Configuração do Claude Desktop não encontrada. Criando diretório e arquivo...")
        fs.mkdirSync(configDir, { recursive: true })
      }
      
      // Build the gravel-finance config
      const absoluteDbPath = path.join(cwd, "prisma", "dev.db")
      const mcpServers = config.mcpServers ?? (config.mcpServers = {})
      
      mcpServers["gravel-finance"] = {
        command: "pnpm",
        args: ["run", "mcp"],
        cwd: cwd,
        env: {
          DATABASE_URL: `file:${absoluteDbPath}`
        }
      }
      
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
        log.success("Gravel MCP Server instalado com sucesso no Claude Desktop!")
      } catch (error) {
        log.error(`Erro ao gravar configuração no Claude: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // 2. Skill creation
    if (!options.claudeOnly) {
      const skillsDir = path.join(cwd, ".agents", "skills", "gravel_mcp")
      log.info(`Criando Skill para Codex/Antigravity em: ${skillsDir}`)
      
      try {
        fs.mkdirSync(skillsDir, { recursive: true })
        const skillFilePath = path.join(skillsDir, "SKILL.md")
        
        const skillContent = `---
name: gravel-financial-analyst
description: Permite analisar contas, transações, fluxos de caixa e simular cenários financeiros no Gravel Finance usando ferramentas MCP.
---

# Gravel Financial Analyst Skill

Você tem acesso ao servidor MCP \`gravel-finance\`. Use-o sempre que o usuário solicitar diagnósticos de contas, buscas de transações, criação de metas de economia, simulação de projeções financeiras ou fechamento mensal.

## Diretrizes de Uso das Ferramentas:
1. Para dar um panorama geral de saúde: Chame \`get_financial_snapshot\` e \`analyze_financial_health\`.
2. Para criar transações manuais: Chame \`create_transaction\` garantindo que o valor é positivo e especificando a direção (INFLOW ou OUTFLOW).
3. Para ajustar categorização: Use \`update_transaction\` definindo o \`domainCategoryId\` correto ou use \`create_automation_rule\` para registrar padrões contínuos.
4. Para simular e analisar: Chame \`project_future_cashflow\` ou use \`create_scenario\` para criar simulações temporárias de receitas/despesas futuras.
`
        fs.writeFileSync(skillFilePath, skillContent, "utf-8")
        log.success("Skill gravel_mcp criada com sucesso em .agents/skills/gravel_mcp/SKILL.md!")
      } catch (error) {
        log.error(`Erro ao criar a Skill local: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })
