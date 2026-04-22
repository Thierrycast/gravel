#!/usr/bin/env node
import { Command } from "commander"
import { diffCommand } from "./commands/diff.js"
import { doctorCommand } from "./commands/doctor.js"
import { exportCommand } from "./commands/export.js"
import { opsCommand } from "./commands/ops.js"
import { projectCommand } from "./commands/project.js"
import { promptPackCommand } from "./commands/prompt-pack.js"
import { snapshotCommand } from "./commands/snapshot.js"

const program = new Command()
  .name("gravel")
  .description("Gravel Finance CLI - Analise, diagnostico e exportacao para IA")
  .version("0.1.0")

program.addCommand(doctorCommand)
program.addCommand(snapshotCommand)
program.addCommand(exportCommand)
program.addCommand(promptPackCommand)
program.addCommand(diffCommand)
program.addCommand(opsCommand)
program.addCommand(projectCommand)

program.parse()
