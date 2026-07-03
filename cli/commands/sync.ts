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
  .option("--no-refresh", "Não disparar PATCH /items (apenas reler dados existentes)")
  .action(async (options) => {
    const { prisma } = await import("../../lib/prisma.js")
    const provider = options.provider.toLowerCase()
    // commander converte --no-refresh em options.refresh=false.
    const refresh = options.refresh !== false

    if (options.force) {
      await prisma.opsSyncLock.deleteMany()
      log.info("Locks de sincronização forçados a serem liberados.")
    }

    log.info(
      `Disparando sync operacional para o provedor: ${provider}${refresh ? " (com refresh de item via PATCH)" : " (somente releitura)"}...`,
    )

    if (provider === "all") {
      const { runFullOperationalSync } = await import("../../lib/ingestion/provider-sync.js")
      runFullOperationalSync({ pluggy: { refresh } }).catch(err => console.error("Falha no full sync:", err))
    } else if (provider === "pluggy") {
      const { runPluggySync } = await import("../../lib/ingestion/provider-sync.js")
      runPluggySync({ scope: "cli/manual", resource: "full", refresh }).catch(err => console.error("Falha no pluggy sync:", err))
    } else if (provider === "binance") {
      const { runBinanceSync } = await import("../../lib/ingestion/provider-sync.js")
      runBinanceSync({ scope: "cli/manual", resource: "full" }).catch(err => console.error("Falha no binance sync:", err))
    }

    log.success("Sincronização iniciada em segundo plano! Acompanhe via pnpm gravel sync items ou ops status.")
  })

syncCommand
  .command("refresh-item")
  .description("Dispara PATCH /items/{id} e acompanha até o sync terminar")
  .argument("<itemId>", "ID do item Pluggy")
  .option("--no-wait", "Disparar e retornar sem aguardar (fire-and-forget)")
  .action(async (itemId: string, options: { wait?: boolean }) => {
    const { refreshPluggyItemAndWait } = await import("../../lib/pluggy-item-refresh.js")

    if (options.wait === false) {
      void refreshPluggyItemAndWait(itemId).catch((err) =>
        console.error("Falha no refresh:", err),
      )
      log.success(`Refresh do item ${itemId} disparado em segundo plano.`)
      return
    }

    log.info(`Disparando PATCH e acompanhando o item ${itemId}...`)
    const result = await refreshPluggyItemAndWait(itemId)
    const color =
      result.outcome === "SUCCESS"
        ? chalk.green
        : result.outcome === "PARTIAL_SUCCESS"
          ? chalk.yellow
          : chalk.red
    log.heading("Resultado do refresh")
    console.log(`  Outcome:         ${color(result.outcome)}`)
    console.log(`  executionStatus: ${result.executionStatus ?? "—"}`)
    console.log(`  status:          ${result.status ?? "—"}`)
    console.log(`  Reprojetado:     ${result.reprojected ? "sim" : "não"}`)
    if (result.message) console.log(`  Mensagem:        ${result.message}`)
  })

syncCommand
  .command("items")
  .description("Estado de sincronização de cada item Pluggy")
  .action(async () => {
    const { prisma } = await import("../../lib/prisma.js")
    const items = await prisma.pluggyItem.findMany({ orderBy: { updatedAt: "desc" } })

    log.heading("Itens Pluggy")
    if (items.length === 0) {
      log.warn("Nenhum item conectado.")
      return
    }

    const table = new Table({
      head: ["Instituição", "status", "execution", "últ. sync", "erro"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    })
    for (const item of items) {
      const exec = item.executionStatus ?? "—"
      const execColor =
        exec === "SUCCESS" ? chalk.green : exec === "PARTIAL_SUCCESS" ? chalk.yellow : exec === "ERROR" ? chalk.red : chalk.gray
      table.push([
        (item.connectorName ?? item.pluggyItemId).slice(0, 22),
        item.status ?? "—",
        execColor(exec),
        item.lastSyncedAt ? item.lastSyncedAt.toISOString().slice(0, 16) : "—",
        item.syncError ? chalk.red(item.syncError.slice(0, 30)) : "—",
      ])
    }
    console.log(table.toString())
  })

syncCommand
  .command("balance")
  .description("Atualiza o saldo de uma conta em tempo real (GET /accounts/{id}/balance)")
  .argument("<accountId>", "ID da conta de domínio")
  .action(async (accountId: string) => {
    const { refreshDomainAccountBalance } = await import("../../lib/pluggy-balance.js")
    const result = await refreshDomainAccountBalance(accountId)
    log.heading("Saldo em tempo real")
    console.log(`  ok:            ${result.ok ? chalk.green("sim") : chalk.red("não")}`)
    console.log(`  origem:        ${result.source}`)
    console.log(`  saldo:         ${result.effectiveBalance ?? "—"} ${result.currencyCode ?? ""}`)
    console.log(`  atualizado em: ${result.updateDateTime ?? "—"}`)
    console.log(`  status:        ${result.status}`)
    if (result.message) console.log(`  mensagem:      ${result.message}`)
  })

syncCommand
  .command("enrich-items")
  .description("Roda recurring-payments + behavior-analysis por item")
  .argument("[itemId]", "ID do item (omitir = todos)")
  .action(async (itemId?: string) => {
    const { runItemEnrichment } = await import("../../lib/domain/enrichment/pluggy-item.js")
    log.info("Rodando enriquecimento por item (recorrências + comportamento)...")
    const results = await runItemEnrichment(itemId)
    const table = new Table({
      head: ["Item", "recorrências", "sinais", "erro"].map((h) => chalk.bold(h)),
      style: { head: [], border: [] },
    })
    for (const r of results) {
      table.push([
        r.itemId.slice(0, 22),
        String(r.recurring ?? "—"),
        String(r.behavior ?? "—"),
        r.error ? chalk.red(r.error.slice(0, 30)) : "—",
      ])
    }
    console.log(table.toString())
    log.success("Enriquecimento por item concluído.")
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
