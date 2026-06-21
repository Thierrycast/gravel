import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"
import { log } from "../core/logger.js"

export const syncCommand = new Command("sync").description(
  "Disparo e acompanhamento da sincronização"
)

syncCommand
  .command("trigger")
  .description("Dispara sincronização operacional sob demanda")
  .option("-p, --provider <provider>", "Provedor a sincronizar (pluggy|binance|all)", "all")
  .option("-f, --force", "Forçar liberação de locks de sync existentes")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const provider = options.provider.toLowerCase()

    if (options.force) {
      await prisma.opsSyncLock.deleteMany()
      log.info("Locks de sincronização forçados a serem liberados.")
    }

    log.info(`Disparando sync operacional para o provedor: ${provider}...`)

    if (provider === "all") {
      const { runFullOperationalSync } = await import("../../lib/ingestion/provider-sync.js")
      runFullOperationalSync({}).catch(err => console.error("Falha no full sync:", err))
    } else if (provider === "pluggy") {
      const { runPluggySync } = await import("../../lib/ingestion/provider-sync.js")
      runPluggySync({ scope: "cli/manual", resource: "full" }).catch(err => console.error("Falha no pluggy sync:", err))
    } else if (provider === "binance") {
      const { runBinanceSync } = await import("../../lib/ingestion/provider-sync.js")
      runBinanceSync({ scope: "cli/manual", resource: "full" }).catch(err => console.error("Falha no binance sync:", err))
    }

    log.success("Sincronização iniciada em segundo plano! Acompanhe via pnpm gravel ops status ou ops sync-runs.")
  })

syncCommand
  .command("status")
  .description("Visualiza o status do último sync run")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const { SourceProvider } = await import("@prisma/client")

    let lastRun = await prisma.opsSyncRun.findFirst({
      where: { 
        provider: SourceProvider.MANUAL,
        resource: "sync-full"
      },
      orderBy: { startedAt: "desc" },
    })

    if (!lastRun) {
      lastRun = await prisma.opsSyncRun.findFirst({
        where: { provider: SourceProvider.PLUGGY },
        orderBy: { startedAt: "desc" },
      })
    }

    log.heading("Status de Sincronização")
    if (!lastRun) {
      log.warn("Nenhum registro de sincronização encontrado.")
      return
    }

    const table = new Table({
      head: [chalk.bold("Atributo"), chalk.bold("Valor")],
      colWidths: [20, 48],
      style: { head: [], border: [] },
    })

    table.push(["Provider", lastRun.provider])
    table.push(["Resource", lastRun.resource || "N/A"])
    table.push(["Iniciado em", lastRun.startedAt.toISOString()])
    table.push(["Finalizado em", lastRun.finishedAt ? lastRun.finishedAt.toISOString() : "Em execução"])
    
    const statusColor = lastRun.status === "SUCCESS" ? chalk.green : lastRun.status === "RUNNING" ? chalk.cyan : chalk.red
    table.push(["Status", statusColor(lastRun.status)])

    console.log(table.toString())
  })
