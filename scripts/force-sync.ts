import { runPluggySync } from "../lib/ingestion/provider-sync.js"
import { prisma } from "../lib/prisma.js"

async function main() {
  console.log("Starting forced Pluggy sync...")
  try {
    const summary = await runPluggySync({
      scope: "manual-force-sync",
      resource: "full-sync",
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
