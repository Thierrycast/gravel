const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const deleted = await prisma.opsSyncLock.deleteMany({});
    console.log(`--- Sync Locks Cleared ---`);
    console.log(`Deleted ${deleted.count} locks.`);
  } catch (err) {
    console.error('Error clearing locks:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
