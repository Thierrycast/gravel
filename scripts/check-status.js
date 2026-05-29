const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const items = await prisma.pluggyItem.count();
    const accounts = await prisma.domainAccount.count();
    const transactions = await prisma.domainTransaction.count();
    const locks = await prisma.opsSyncLock.findMany();
    
    console.log('--- Database Status ---');
    console.log(`Pluggy Items: ${items}`);
    console.log(`Domain Accounts: ${accounts}`);
    console.log(`Domain Transactions: ${transactions}`);
    console.log('--- Active Locks ---');
    locks.forEach(l => {
      console.log(`- ${l.lockKey} (Expires: ${l.expiresAt})`);
    });
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
