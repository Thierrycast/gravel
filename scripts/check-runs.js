const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const lastRuns = await prisma.opsSyncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 5
    });
    
    console.log('--- Recent Sync Runs ---');
    lastRuns.forEach(run => {
      console.log(`- [${run.status}] ${run.provider} ${run.resource} (${run.startedAt})`);
      if (run.errorMessage) console.log(`  Error: ${run.errorMessage}`);
    });
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
