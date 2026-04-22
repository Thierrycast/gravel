import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"

import { log } from "../core/logger.js"

function fmtAge(date: Date): string {
  const ms = Date.now() - date.getTime()
  const minutes = Math.round(ms / (1000 * 60))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function statusColor(status: string): string {
  if (status === "SUCCESS" || status === "ok") return chalk.green(status)
  if (status === "RUNNING") return chalk.cyan(status)
  if (status === "FAILED" || status === "ERROR") return chalk.red(status)
  return chalk.yellow(status)
}

export const opsCommand = new Command("ops").description("Diagnostico operacional do Gravel")

opsCommand
  .command("status")
  .description("Resumo geral de operacao")
  .action(async () => {
    const { prisma } = await import("@/lib/prisma")

    const [pluggyItems, pluggyRuns, binanceRuns, locks, recentFailures, checkpoints] = await Promise.all([
      prisma.pluggyItem.count(),
      prisma.pluggySyncRun.count(),
      prisma.binanceSyncRun.count(),
      prisma.opsSyncLock.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.opsSyncFailure.count({
        where: { createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.opsSyncCheckpoint.count(),
    ])

    log.heading("Gravel Ops Status")
    const table = new Table({
      head: [chalk.bold("Indicador"), chalk.bold("Valor")],
      colWidths: [30, 30],
      style: { head: [], border: [] },
    })
    table.push(["Pluggy Items", String(pluggyItems)])
    table.push(["Pluggy Sync Runs (total)", String(pluggyRuns)])
    table.push(["Binance Sync Runs (total)", String(binanceRuns)])
    table.push(["Checkpoints", String(checkpoints)])
    table.push(["Locks ativos", locks === 0 ? chalk.green("0") : chalk.yellow(String(locks))])
    table.push([
      "Falhas (7d)",
      recentFailures === 0 ? chalk.green("0") : chalk.red(String(recentFailures)),
    ])
    console.log(table.toString())

    await prisma.$disconnect()
  })

opsCommand
  .command("sync-runs")
  .description("Ultimos sync runs por provider")
  .option("-l, --limit <n>", "Numero maximo por provider", "10")
  .option("--provider <p>", "Filtrar por provider (pluggy|binance)")
  .action(async (options) => {
    const { prisma } = await import("@/lib/prisma")
    const limit = Number(options.limit)
    const provider = options.provider as string | undefined

    log.heading("Sync Runs")

    if (!provider || provider === "pluggy") {
      const pluggyRuns = await prisma.pluggySyncRun.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
      })
      console.log(chalk.bold("\nPluggy"))
      const table = new Table({
        head: ["ID", "Status", "Iniciado", "Idade"],
        colWidths: [38, 12, 26, 10],
        style: { head: [], border: [] },
      })
      for (const r of pluggyRuns) {
        table.push([
          r.id.slice(0, 36),
          statusColor(r.status),
          r.startedAt.toISOString(),
          fmtAge(r.startedAt),
        ])
      }
      console.log(table.toString())
    }

    if (!provider || provider === "binance") {
      const binanceRuns = await prisma.binanceSyncRun.findMany({
        orderBy: { startedAt: "desc" },
        take: limit,
      })
      console.log(chalk.bold("\nBinance"))
      const table = new Table({
        head: ["ID", "Status", "Iniciado", "Idade"],
        colWidths: [38, 12, 26, 10],
        style: { head: [], border: [] },
      })
      for (const r of binanceRuns) {
        table.push([
          r.id.slice(0, 36),
          statusColor(r.status),
          r.startedAt.toISOString(),
          fmtAge(r.startedAt),
        ])
      }
      console.log(table.toString())
    }

    await prisma.$disconnect()
  })

opsCommand
  .command("failures")
  .description("Falhas de sync recentes")
  .option("-l, --limit <n>", "Numero maximo de registros", "20")
  .option("-d, --days <n>", "Janela em dias", "30")
  .action(async (options) => {
    const { prisma } = await import("@/lib/prisma")
    const limit = Number(options.limit)
    const days = Number(options.days)

    const failures = await prisma.opsSyncFailure.findMany({
      where: { createdAt: { gt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    log.heading(`Falhas (${days}d)`)
    if (failures.length === 0) {
      log.success("Nenhuma falha no periodo")
      await prisma.$disconnect()
      return
    }

    const table = new Table({
      head: ["Quando", "Provider", "Resource", "Mensagem"],
      colWidths: [22, 12, 18, 60],
      style: { head: [], border: [] },
      wordWrap: true,
    })
    for (const f of failures) {
      table.push([
        f.createdAt.toISOString().slice(0, 19),
        f.provider,
        f.resource,
        f.message.slice(0, 200),
      ])
    }
    console.log(table.toString())
    await prisma.$disconnect()
  })

opsCommand
  .command("checkpoints")
  .description("Checkpoints de cursor por provider/resource")
  .action(async () => {
    const { prisma } = await import("@/lib/prisma")

    const checkpoints = await prisma.opsSyncCheckpoint.findMany({
      orderBy: [{ provider: "asc" }, { resource: "asc" }],
    })

    log.heading("Checkpoints")
    if (checkpoints.length === 0) {
      log.warn("Nenhum checkpoint registrado")
      await prisma.$disconnect()
      return
    }

    const table = new Table({
      head: ["Provider", "Resource", "Cursor", "Valor", "Atualizado"],
      colWidths: [12, 18, 18, 30, 22],
      style: { head: [], border: [] },
    })
    for (const c of checkpoints) {
      table.push([
        c.provider,
        c.resource,
        c.cursorKey,
        (c.value ?? "").slice(0, 28),
        c.updatedAt.toISOString().slice(0, 19),
      ])
    }
    console.log(table.toString())
    await prisma.$disconnect()
  })

opsCommand
  .command("locks")
  .description("Locks ativos e expirados")
  .option("--all", "Inclui locks expirados")
  .action(async (options) => {
    const { prisma } = await import("@/lib/prisma")

    const where = options.all ? {} : { expiresAt: { gt: new Date() } }
    const locks = await prisma.opsSyncLock.findMany({
      where,
      orderBy: { lockedAt: "desc" },
    })

    log.heading("Locks")
    if (locks.length === 0) {
      log.success("Nenhum lock encontrado")
      await prisma.$disconnect()
      return
    }

    const table = new Table({
      head: ["Lock Key", "Owner", "Locked", "Expira", "Status"],
      colWidths: [30, 20, 22, 22, 10],
      style: { head: [], border: [] },
    })
    const now = Date.now()
    for (const l of locks) {
      const expired = l.expiresAt.getTime() < now
      table.push([
        l.lockKey,
        l.owner.slice(0, 18),
        l.lockedAt.toISOString().slice(0, 19),
        l.expiresAt.toISOString().slice(0, 19),
        expired ? chalk.dim("expired") : chalk.cyan("active"),
      ])
    }
    console.log(table.toString())
    await prisma.$disconnect()
  })
