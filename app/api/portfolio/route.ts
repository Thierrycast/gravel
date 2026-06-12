import { NextResponse } from "next/server"

import { getPortfolioPayload } from "@/lib/domain/derived"
import { serializeForJson } from "@/lib/core/http"
import { getUsdBrlRate } from "@/lib/exchange-rate"
import { isBrlCurrency } from "@/lib/domain/currency"

export const dynamic = "force-dynamic"

function mapAccountKind(kind: string): string {
  const map: Record<string, string> = {
    BANK: "checking",
    CASH: "checking",
    CARD: "credit",
    CREDIT: "credit",
    INVESTMENT: "investment",
    CRYPTO: "crypto",
    OTHER: "other",
  }
  return map[kind] ?? "other"
}

export async function GET() {
  const [payload, usdBrl] = await Promise.all([
    getPortfolioPayload(),
    getUsdBrlRate(),
  ])

  // Binance crypto is USD; bank/investment values are BRL — convert before mixing or totals silently blend two currencies.
  if (!Number.isFinite(usdBrl) || usdBrl <= 0) {
    return NextResponse.json(
      { error: { message: "Cotacao USD/BRL indisponivel para calcular portfolio" } },
      { status: 502 }
    )
  }

  const cryptoTotalBrl = Number(payload.summary.crypto.toString()) * usdBrl
  const fiatLiquidNum = Number(payload.summary.liquidAssets.toString())
  const fiatInvestmentsNum = Number(payload.summary.investments.toString())
  const fiatAssetsNum = fiatLiquidNum + fiatInvestmentsNum

  const grossAssetsNum = fiatAssetsNum + cryptoTotalBrl
  const liabilitiesTotal = payload.summary.liabilitiesTotal
  const liabilitiesTotalNum = Number(liabilitiesTotal.toString())
  const netWorthNum = grossAssetsNum - liabilitiesTotalNum

  const fiatItems: Array<{
    name: string
    type: string
    value: number
    sharePercent: number
  }> = []

  // Pluggy CARD/CREDIT balance = amount owed (positive) — liability, not an asset
  const creditKinds = new Set(["CARD", "CREDIT"])

  for (const account of payload.accounts) {
    if (creditKinds.has(account.kind)) continue
    if (!isBrlCurrency(account.currencyCode)) continue
    const balance = Number(account.balance?.toString() ?? "0")
    if (balance > 0) {
      fiatItems.push({
        name: account.name,
        type: mapAccountKind(account.kind),
        value: balance,
        sharePercent: fiatAssetsNum > 0 ? (balance / fiatAssetsNum) * 100 : 0,
      })
    }
  }
  for (const inv of payload.investments) {
    if (!isBrlCurrency(inv.currencyCode)) continue
    const balance = Number(inv.balance?.toString() ?? "0")
    if (balance > 0) {
      fiatItems.push({
        name: inv.name,
        type: "investment",
        value: balance,
        sharePercent: fiatAssetsNum > 0 ? (balance / fiatAssetsNum) * 100 : 0,
      })
    }
  }
  fiatItems.sort((a, b) => b.value - a.value)

  const cryptoItems: Array<{
    name: string
    type: string
    value: number
    sharePercent: number
  }> = []
  if (payload.crypto.allocations) {
    for (const allocation of payload.crypto.allocations) {
      const valueUsd = Number(allocation.value?.toString() ?? "0")
      if (valueUsd > 0) {
        const valueBrl = valueUsd * usdBrl
        cryptoItems.push({
          name: allocation.asset,
          type: "crypto",
          value: valueBrl,
          sharePercent:
            cryptoTotalBrl > 0 ? (valueBrl / cryptoTotalBrl) * 100 : 0,
        })
      }
    }
  }
  cryptoItems.sort((a, b) => b.value - a.value)

  const assetItems = [
    ...fiatItems.map((item) => ({
      ...item,
      percentage: grossAssetsNum > 0 ? (item.value / grossAssetsNum) * 100 : 0,
    })),
    ...cryptoItems.map((item) => ({
      ...item,
      percentage: grossAssetsNum > 0 ? (item.value / grossAssetsNum) * 100 : 0,
    })),
  ].sort((a, b) => b.value - a.value)

  // Liabilities ─ no currency mix needed, all BRL
  const liabilityItems: Array<{
    name: string
    type: string
    value: number
    percentage: number
  }> = []
  for (const loan of payload.loans) {
    if (!isBrlCurrency(loan.currencyCode)) continue
    const amount = Number(loan.contractAmount?.toString() ?? "0")
    if (amount > 0) {
      liabilityItems.push({
        name: loan.productName ?? loan.contractNumber ?? "Empréstimo",
        type: "loan",
        value: amount,
        percentage:
          liabilitiesTotalNum > 0 ? (amount / liabilitiesTotalNum) * 100 : 0,
      })
    }
  }
  for (const account of payload.accounts) {
    if (!isBrlCurrency(account.currencyCode)) continue
    const balance = Number(account.balance?.toString() ?? "0")
    const isCreditAccount = creditKinds.has(account.kind)
    // Pluggy card balance is positive (amount owed); non-card negatives are also liabilities
    const liabilityAmount = isCreditAccount
      ? Math.max(balance, 0)
      : Math.max(Math.abs(Math.min(balance, 0)), 0)
    if (liabilityAmount > 0) {
      liabilityItems.push({
        name: account.name,
        type: "credit",
        value: liabilityAmount,
        percentage:
          liabilitiesTotalNum > 0 ? (liabilityAmount / liabilitiesTotalNum) * 100 : 0,
      })
    }
  }
  const openBillsAmount = Number(payload.summary.openBills.toString())
  if (openBillsAmount > 0 && liabilityItems.length === 0) {
    liabilityItems.push({
      name: "Faturas em aberto",
      type: "credit",
      value: openBillsAmount,
      percentage:
        liabilitiesTotalNum > 0 ? (openBillsAmount / liabilitiesTotalNum) * 100 : 0,
    })
  }
  liabilityItems.sort((a, b) => b.value - a.value)

  // History — historic snapshots are stored in BRL already
  const history = payload.history.map((point) => ({
    date: point.date,
    netWorth: Number(point.netWorth.toString()),
    assets: grossAssetsNum,
    liabilities: liabilitiesTotalNum,
  }))

  const result = {
    assets: { total: grossAssetsNum, items: assetItems },
    liabilities: { total: liabilitiesTotalNum, items: liabilityItems },
    netWorth: netWorthNum,
    history,
    recurring: {
      monthlyIncome: Number(payload.summary.recurringIncome.toString()),
      monthlyExpenses: Number(payload.summary.recurringExpense.toString()),
    },
    breakdown: {
      fiat: {
        liquid: fiatLiquidNum,
        investments: fiatInvestmentsNum,
        total: fiatAssetsNum,
        netWorth: fiatAssetsNum - liabilitiesTotalNum,
        items: fiatItems,
      },
      crypto: {
        total: cryptoTotalBrl,
        netWorth: cryptoTotalBrl,
        items: cryptoItems,
        usdBrlRate: usdBrl,
      },
    },
  }

  return NextResponse.json(serializeForJson(result))
}
