import { existsSync } from "node:fs"
import path from "node:path"
import { Command } from "commander"
import Table from "cli-table3"
import chalk from "chalk"

import { log } from "../core/logger.js"
import { ENV_FILE, PRISMA_SCHEMA, PROJECT_ROOT } from "../core/paths.js"

export const doctorCommand = new Command("doctor")
  .description("Verifica ambiente e saude local do Gravel")
  .option("--json", "Saida em JSON")
  .action(async (options) => {
    const checks: Array<{
      name: string
      status: "ok" | "warn" | "fail"
      detail: string
    }> = []

    // 0. Check Node.js version
    const nodeVersion = process.version
    const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0])
    checks.push({
      name: "Node.js",
      status: majorVersion >= 20 ? "ok" : "warn",
      detail: `${nodeVersion} (Recomendado >= 20)`,
    })

    // 1. Check .env and keys
    const envExists = existsSync(ENV_FILE)
    if (!envExists) {
      checks.push({
        name: ".env",
        status: "fail",
        detail: "Arquivo .env nao encontrado",
      })
    } else {
      const requiredKeys = ["DATABASE_URL", "PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET"]
      const missingKeys = requiredKeys.filter((k) => !process.env[k])
      
      checks.push({
        name: ".env Keys",
        status: missingKeys.length === 0 ? "ok" : "warn",
        detail: missingKeys.length === 0 
          ? "Chaves principais encontradas" 
          : `Faltando: ${missingKeys.join(", ")}`,
      })
    }

    // 2. Check DATABASE_URL
    const dbUrl = process.env.DATABASE_URL
    const dbFile = dbUrl?.startsWith("file:") ? dbUrl.replace("file:", "") : null
    const dbFileExists = dbFile ? existsSync(path.resolve(PROJECT_ROOT, dbFile)) : false

    checks.push({
      name: "DATABASE_URL",
      status: dbUrl && dbFileExists ? "ok" : "fail",
      detail: dbUrl 
        ? `${dbUrl.replace(/\/[^/]*$/, "/***")} (${dbFileExists ? "Arquivo OK" : "Arquivo nao encontrado"})` 
        : "Nao definido",
    })

    // 3. Check Prisma schema
    const schemaExists = existsSync(PRISMA_SCHEMA)
    checks.push({
      name: "prisma/schema.prisma",
      status: schemaExists ? "ok" : "fail",
      detail: schemaExists ? "Encontrado" : "Schema nao encontrado",
    })

    // 4. Check database connectivity & tables
    try {
      const { prisma } = await import("@/lib/prisma")
      const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' ORDER BY name"
      )
      const tableCount = tables.length
      checks.push({
        name: "SQLite",
        status: tableCount > 0 ? "ok" : "warn",
        detail: `Conectado, ${tableCount} tabelas`,
      })

      // 5. Check key domain tables
      const [
        accountCount,
        transactionCount,
        billCount,
        categoryCount,
        merchantCount,
        investmentCount,
        cryptoCount,
      ] = await Promise.all([
        prisma.domainAccount.count(),
        prisma.domainTransaction.count(),
        prisma.domainBill.count(),
        prisma.domainCategory.count(),
        prisma.domainMerchant.count(),
        prisma.domainInvestment.count(),
        prisma.domainCryptoAsset.count(),
      ])

      checks.push({
        name: "DomainAccount",
        status: accountCount > 0 ? "ok" : "warn",
        detail: `${accountCount} registros`,
      })
      checks.push({
        name: "DomainTransaction",
        status: transactionCount > 0 ? "ok" : "warn",
        detail: `${transactionCount} registros`,
      })
      checks.push({
        name: "DomainBill",
        status: billCount > 0 ? "ok" : "warn",
        detail: `${billCount} registros`,
      })
      checks.push({
        name: "DomainCategory",
        status: categoryCount > 0 ? "ok" : "warn",
        detail: `${categoryCount} registros`,
      })
      checks.push({
        name: "DomainMerchant",
        status: merchantCount > 0 ? "ok" : "warn",
        detail: `${merchantCount} registros`,
      })
      checks.push({
        name: "DomainInvestment",
        status: investmentCount >= 0 ? "ok" : "warn",
        detail: `${investmentCount} registros`,
      })
      checks.push({
        name: "DomainCryptoAsset",
        status: cryptoCount >= 0 ? "ok" : "warn",
        detail: `${cryptoCount} registros`,
      })

      // 6. Check providers / sync status
      const [pluggyItems, latestPluggySync, latestBinanceSync] = await Promise.all([
        prisma.pluggyItem.count(),
        prisma.pluggySyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
        prisma.binanceSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
      ])

      checks.push({
        name: "Pluggy Items",
        status: pluggyItems > 0 ? "ok" : "warn",
        detail: `${pluggyItems} items conectados`,
      })

      if (latestPluggySync) {
        const age = Date.now() - latestPluggySync.startedAt.getTime()
        const hours = Math.round(age / (1000 * 60 * 60))
        checks.push({
          name: "Ultimo sync Pluggy",
          status: latestPluggySync.status === "SUCCESS" ? "ok" : "warn",
          detail: `${latestPluggySync.status} (${hours}h atras)`,
        })
      } else {
        checks.push({
          name: "Ultimo sync Pluggy",
          status: "warn",
          detail: "Nenhum sync encontrado",
        })
      }

      if (latestBinanceSync) {
        const age = Date.now() - latestBinanceSync.startedAt.getTime()
        const hours = Math.round(age / (1000 * 60 * 60))
        checks.push({
          name: "Ultimo sync Binance",
          status: latestBinanceSync.status === "SUCCESS" ? "ok" : "warn",
          detail: `${latestBinanceSync.status} (${hours}h atras)`,
        })
      } else {
        checks.push({
          name: "Ultimo sync Binance",
          status: "warn",
          detail: "Nenhum sync encontrado",
        })
      }

      // 7. Check for active locks
      const activeLocks = await prisma.opsSyncLock.count({
        where: { expiresAt: { gt: new Date() } },
      })
      checks.push({
        name: "Locks ativos",
        status: activeLocks === 0 ? "ok" : "warn",
        detail: activeLocks === 0 ? "Nenhum" : `${activeLocks} lock(s) ativo(s)`,
      })

      await prisma.$disconnect()
    } catch (error) {
      checks.push({
        name: "SQLite",
        status: "fail",
        detail: error instanceof Error ? error.message : "Erro desconhecido",
      })
    }

    // Output
    if (options.json) {
      const allOk = checks.every((c) => c.status === "ok")
      console.log(JSON.stringify({ healthy: allOk, checks }, null, 2))
      process.exit(allOk ? 0 : 1)
      return
    }

    log.heading("Gravel Doctor")

    const table = new Table({
      head: [chalk.bold("Check"), chalk.bold("Status"), chalk.bold("Detalhe")],
      colWidths: [25, 10, 50],
      style: { head: [], border: [] },
    })

    for (const check of checks) {
      const icon =
        check.status === "ok"
          ? chalk.green("OK")
          : check.status === "warn"
            ? chalk.yellow("WARN")
            : chalk.red("FAIL")
      table.push([check.name, icon, check.detail])
    }

    console.log(table.toString())

    const failures = checks.filter((c) => c.status === "fail")
    const warnings = checks.filter((c) => c.status === "warn")

    console.log()
    if (failures.length > 0) {
      log.error(`${failures.length} falha(s) encontrada(s)`)
      process.exit(1)
    } else if (warnings.length > 0) {
      log.warn(`${warnings.length} aviso(s), mas sistema funcional`)
    } else {
      log.success("Tudo OK!")
    }
  })
