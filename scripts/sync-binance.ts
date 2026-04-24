import { syncBinanceData } from "../lib/binance-sync.js"
import { prisma } from "../lib/prisma.js"

async function main() {
  console.log("Starting Binance sync...")
  try {
    const summary = await syncBinanceData({
      resources: ["assets", "trades", "prices"],
    })
    console.log("Sync completed successfully!")
    console.log(JSON.stringify(summary, null, 2))
  } catch (error) {
    console.error("Sync failed:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
