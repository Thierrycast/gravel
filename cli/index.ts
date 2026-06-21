#!/usr/bin/env node
import { Command } from "commander"
import { diffCommand } from "./commands/diff.js"
import { doctorCommand } from "./commands/doctor.js"
import { exportCommand } from "./commands/export.js"
import { opsCommand } from "./commands/ops.js"
import { projectCommand } from "./commands/project.js"
import { promptPackCommand } from "./commands/prompt-pack.js"
import { snapshotCommand } from "./commands/snapshot.js"
import { reviewCommand } from "./commands/review.js"
import { transactionsCommand } from "./commands/transactions.js"
import { accountsCommand } from "./commands/accounts.js"
import { billsCommand } from "./commands/bills.js"
import { goalsCommand } from "./commands/goals.js"
import { scenariosCommand } from "./commands/scenarios.js"
import { lendsCommand } from "./commands/lends.js"
import { rulesCommand } from "./commands/rules.js"
import { settingsCommand } from "./commands/settings.js"
import { syncCommand } from "./commands/sync.js"
import { investmentsCommand } from "./commands/investments.js"
import { cryptoCommand } from "./commands/crypto.js"
import { mcpCommand } from "./commands/mcp.js"

const program = new Command()
  .name("gravel")
  .description("Gravel Finance CLI - Analise, diagnostico e exportacao para IA (Gerenciando o cascalho)")
  .version("0.1.0")

program.addCommand(doctorCommand)
program.addCommand(snapshotCommand)
program.addCommand(exportCommand)
program.addCommand(promptPackCommand)
program.addCommand(diffCommand)
program.addCommand(opsCommand)
program.addCommand(projectCommand)
program.addCommand(reviewCommand)
program.addCommand(transactionsCommand)
program.addCommand(accountsCommand)
program.addCommand(billsCommand)
program.addCommand(goalsCommand)
program.addCommand(scenariosCommand)
program.addCommand(lendsCommand)
program.addCommand(rulesCommand)
program.addCommand(settingsCommand)
program.addCommand(syncCommand)
program.addCommand(investmentsCommand)
program.addCommand(cryptoCommand)
program.addCommand(mcpCommand)

program.parse()