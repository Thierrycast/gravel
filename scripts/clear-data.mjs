import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando limpeza seletiva...')

  // Tabelas de Domínio (Dados derivados e processados)
  await prisma.domainTransaction.deleteMany()
  await prisma.domainBill.deleteMany()
  await prisma.domainInvestment.deleteMany()
  await prisma.domainCryptoAsset.deleteMany()
  await prisma.domainRecurringRule.deleteMany()
  await prisma.domainCategory.deleteMany()
  await prisma.domainMerchant.deleteMany()
  await prisma.domainMerchantSource.deleteMany()
  await prisma.domainAccountSource.deleteMany()
  await prisma.domainTransactionSource.deleteMany()
  await prisma.merchantAliasRule.deleteMany()
  await prisma.categoryRule.deleteMany()
  
  // Dados de Ingestão (Raw) - Mantendo PluggyItem e PluggyAccountRecord (configuração)
  await prisma.pluggyTransactionRecord.deleteMany()
  await prisma.pluggyBillRecord.deleteMany()
  await prisma.pluggyAccountBalanceSnapshot.deleteMany()
  await prisma.pluggyInvestmentRecord.deleteMany()
  await prisma.pluggyLoanRecord.deleteMany()
  
  // Binance
  await prisma.binanceTradeRecord.deleteMany()
  await prisma.binanceAssetBalanceSnapshot.deleteMany()
  await prisma.binanceAssetPriceSnapshot.deleteMany()
  
  // Metas e Tags
  await prisma.goal.deleteMany()
  await prisma.transactionTag.deleteMany()
  await prisma.tag.deleteMany()
  
  // Snapshots e Logs de Operação
  await prisma.portfolioSnapshot.deleteMany()
  await prisma.balanceProjection.deleteMany()
  await prisma.opsSyncRun.deleteMany()
  await prisma.opsSyncFailure.deleteMany()
  await prisma.opsSyncCheckpoint.deleteMany()
  await prisma.domainSyncState.deleteMany()

  console.log('Limpeza concluída com sucesso (preservando conexões e contas).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
