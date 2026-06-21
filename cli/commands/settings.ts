import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import type { Prisma as PrismaTypes } from "@prisma/client"
import { log } from "../core/logger.js"

export const settingsCommand = new Command("settings").description(
  "Visualização e edição das preferências do usuário"
)

settingsCommand
  .command("show")
  .description("Exibe configurações atuais")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const s = await prisma.userSetting.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" },
    })

    log.heading("Configurações do Usuário")
    const table = new Table({
      head: [chalk.bold("Configuração"), chalk.bold("Valor")],
      colWidths: [32, 48],
      style: { head: [], border: [] },
    })

    table.push(["Salário Base", s.monthlySalary ? Number(s.monthlySalary).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "N/A"])
    table.push(["Exibir Salário Futuro", s.showFutureSalary ? chalk.green("sim") : chalk.red("não")])
    table.push(["Exibir Contas Futuras", s.showFutureAccounts ? chalk.green("sim") : chalk.red("não")])
    table.push(["Intervalo Auto-Sync (Horas)", String(s.syncIntervalHours)])
    table.push(["Dias de Lookback do Sync", String(s.syncLookbackDays)])
    table.push(["Vault Ativo", s.vaultEnabled ? chalk.green("sim") : chalk.red("não")])
    table.push(["Senha do Vault configurada", s.vaultMasterPassword ? chalk.green("sim") : chalk.red("não")])

    console.log(table.toString())
  })

settingsCommand
  .command("update")
  .description("Atualiza configurações do usuário")
  .option("--salary <val>", "Salário mensal base")
  .option("--show-future-salary <bool>", "Exibir salário futuro projetado (true|false)")
  .option("--show-future-accounts <bool>", "Exibir contas futuras projetadas (true|false)")
  .option("--sync-hours <n>", "Intervalo de sincronização automática em horas")
  .option("--sync-lookback <n>", "Dias de lookback para buscas nas APIs")
  .option("--patterns <patterns>", "Padrões textuais de identificação de salário (separados por vírgula)")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const { Prisma } = await import("@prisma/client")

    const data: PrismaTypes.UserSettingUpdateInput = {}
    if (options.salary) data.monthlySalary = new Prisma.Decimal(Number(options.salary))
    if (options.showFutureSalary) data.showFutureSalary = options.showFutureSalary === "true"
    if (options.showFutureAccounts) data.showFutureAccounts = options.showFutureAccounts === "true"
    if (options.syncHours) data.syncIntervalHours = Number(options.syncHours)
    if (options.syncLookback) data.syncLookbackDays = Number(options.syncLookback)

    if (options.patterns) {
      const salaryPatterns = options.patterns.split(",").map((p: string) => p.trim())
      const current = await prisma.userSetting.findFirst({ where: { id: "default" } })
      let config: { salaryPatterns?: string[] } = {}
      if (current?.dashboardConfigJson) {
        try {
          config = JSON.parse(current.dashboardConfigJson)
        } catch {}
      }
      config.salaryPatterns = salaryPatterns
      data.dashboardConfigJson = JSON.stringify(config)

      const salaryCat = await prisma.domainCategory.findFirst({
        where: {
          OR: [
            { slug: "seed-salary" },
            { name: { contains: "salario" } },
            { name: { contains: "salário" } },
          ]
        }
      })
      if (salaryCat) {
        for (const pattern of salaryPatterns) {
          await prisma.domainTransaction.updateMany({
            where: {
              direction: "INFLOW",
              OR: [
                { description: { contains: pattern } },
                { merchantName: { contains: pattern } },
              ]
            },
            data: { domainCategoryId: salaryCat.id }
          })
        }
      }
    }

    await prisma.userSetting.update({
      where: { id: "default" },
      data,
    })
    log.success("Configurações atualizadas com sucesso!")
  })
