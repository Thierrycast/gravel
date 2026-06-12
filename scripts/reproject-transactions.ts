import { projectPluggyTransactions } from "../lib/domain/projectors/pluggy";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("Starting transaction reprojection...");
  try {
    const projected = await projectPluggyTransactions();
    console.log(`Reprojection completed! Processed ${projected} transactions.`);
  } catch (error) {
    console.error("Reprojection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
