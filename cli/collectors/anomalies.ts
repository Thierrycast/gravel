import { getBillsSummaryMetrics, getCryptoAssetMetrics, getOverviewMetrics } from "@/lib/domain/analytics"
import { getDomainTransactions, getDomainAccounts } from "@/lib/domain/queries"

export interface Anomaly {
  type: string
  severity: "low" | "medium" | "high"
  description: string
  metadata?: any
}

export async function collectAnomalies(params: URLSearchParams): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []

  // 1. Overdue Bills
  const bills = await getBillsSummaryMetrics(params)
  if (bills.counts.overdue > 0) {
    anomalies.push({
      type: "OVERDUE_BILLS",
      severity: "high",
      description: `${bills.counts.overdue} faturas em atraso.`,
      metadata: { totalOverdue: Number(bills.overdueAmount) },
    })
  }

  // 2. Uncategorized Large Transactions
  const txParams = new URLSearchParams(params)
  txParams.set("pageSize", "100") // Look at recent transactions
  const transactions = await getDomainTransactions(txParams)
  
  const uncategorizedLarge = transactions.results.filter(
    (tx) => !tx.domainCategoryId && Math.abs(Number(tx.amount)) > 500
  )
  
  if (uncategorizedLarge.length > 0) {
    anomalies.push({
      type: "UNCATEGORIZED_LARGE_SPEND",
      severity: "medium",
      description: `${uncategorizedLarge.length} transacoes grandes (>\$500) sem categoria no periodo recente.`,
      metadata: {
        txIds: uncategorizedLarge.map((tx) => tx.id),
      },
    })
  }

  // 3. Stale Accounts
  const accounts = await getDomainAccounts(new URLSearchParams())
  const now = new Date().getTime()
  const staleAccounts = accounts.results.filter((acc) => {
    // If not manual, and last sync was more than 3 days ago
    if (acc.sourceProvider !== "MANUAL" && acc.updatedAt) {
      const daysSinceSync = (now - new Date(acc.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      return daysSinceSync > 3
    }
    return false
  })

  if (staleAccounts.length > 0) {
    anomalies.push({
      type: "STALE_ACCOUNTS",
      severity: "low",
      description: `${staleAccounts.length} contas nao sincronizam ha mais de 3 dias.`,
      metadata: {
        accountNames: staleAccounts.map((a) => a.name),
      },
    })
  }

  // 4. Crypto Cost Basis Missing
  const crypto = await getCryptoAssetMetrics(new URLSearchParams({ period: "all" }))
  const missingCostBasis = crypto.results.filter((asset) => asset.costBasisMissing)
  
  if (missingCostBasis.length > 0) {
    anomalies.push({
      type: "CRYPTO_MISSING_HISTORY",
      severity: "medium",
      description: `${missingCostBasis.length} ativos cripto estao com o PnL incompleto devido a falta de historico de compras.`,
      metadata: {
        assets: missingCostBasis.map((a) => a.asset),
      },
    })
  }

  // 5. Negative Cash Flow (Optional heuristics)
  const overview = await getOverviewMetrics(params)
  if (overview.monthlyNet && Number(overview.monthlyNet) < 0) {
    anomalies.push({
      type: "NEGATIVE_MONTHLY_NET",
      severity: "medium",
      description: `O resultado mensal esta negativo em R$ ${Math.abs(Number(overview.monthlyNet)).toFixed(2)}.`,
    })
  }

  return anomalies
}
