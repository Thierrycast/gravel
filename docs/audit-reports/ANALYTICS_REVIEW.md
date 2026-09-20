# Analytics Domain Code Audit Report

## 1. Logical Bugs & Mathematical Flaws

### 1.1 Inconsistent Foreign Currency Conversions
- **Files:** `lib/domain/analytics/cash-flow.ts` (L75-77), `lib/domain/analytics/overview.ts` (L108-110, L292-294), `lib/domain/analytics/reports.ts` (L162-164, L260-262, L322-324)
- **Issue:** The codebase routinely checks `!isBrlCurrency(transaction.currencyCode)` and then blindly multiplies the amount by `usdBrlRate`. This mathematically treats all foreign currencies (EUR, GBP, etc.) as if they were USD, inaccurately inflating or deflating the BRL equivalent.
- **Additional Issue in `overview.ts`:** In `getAccountAllocationMetrics` (L292-L294), the check explicitly uses `normalizeCurrencyCode(account.currencyCode) === "USD"`. Since `normalizeCurrencyCode` returns `"USDT"` or `"USDC"` unchanged, stablecoins bypass this conversion entirely and are summed 1:1 with BRL, distorting `sharePercent` and allocations.

### 1.2 Missing Currency Conversion for Bills
- **File:** `lib/domain/analytics/reports.ts` (L52-99)
- **Issue:** In `getBillsSummaryMetrics`, the code aggregates bills by directly summing the raw `totalAmount` (`sumDecimals(normalizedBills.map(b => b.totalAmount))`). Unlike `overview.ts` which uses `sumConvertedToBrl`, this method fails to convert USD/foreign bills, resulting in a mathematical error where USD and BRL amounts are added together seamlessly.

### 1.3 Credit Card Debt Inflating Assets
- **File:** `lib/domain/analytics/overview.ts` (L280-282)
- **Issue:** In `getAccountAllocationMetrics`, `positiveAccounts` filters for `balance.greaterThan(0)`. However, credit card accounts store debt as a positive balance. By not excluding `creditKinds` from this filter, credit card debt is incorrectly summed into `assetsTotal`, making liabilities appear as assets and corrupting the `sharePercent` math.

### 1.4 Broken Scenario Compounding in Net Worth Projections
- **File:** `lib/domain/analytics/scenarios.ts` (L78-124)
- **Issue:** Inside the `lookaheadMonths` projection loop, `scenarioNW` is reset to the baseline `projectedNW` on every iteration (`scenarioNW = projectedNW;` at L106). Consequently, a scenario event only affects the net worth of the specific month it occurs in and fails to accumulate or compound into future months. The projected net worth drops back to the baseline immediately after the event month.

### 1.5 Missing "Today's Bills" in Due Metrics
- **File:** `lib/domain/analytics/reports.ts` (L78-99)
- **Issue:** When calculating `dueIn7DaysAmount` and `dueIn30DaysAmount`, the code filters bills using `bill.dueDate >= now`. Because `now` is instantiated with the exact current time (e.g., 14:30), any bill due today (which usually has a timestamp of 00:00:00) will evaluate to false and be silently excluded from the totals. It should use `startOfLocalDay(now)`.

## 2. Period Bound Handling Errors

### 2.1 End-of-Period Truncation in Comparison Metrics
- **File:** `lib/domain/analytics/cash-flow.ts` (L184-L185) & `lib/domain/analytics/shared.ts`
- **Issue:** `getCashFlowComparisonWindows` builds `to` dates using `23:59:59.999`. However, `getCashFlowComparisonMetrics` formats these dates as strings using `.toISOString().split("T")[0]`. When this string (e.g., "2023-01-31") is parsed by `buildMetricFilters`, it is converted to `YYYY-MM-DDT00:00:00.000Z`. This means the `lte: filters.to` condition exactly cuts off at midnight at the *start* of the final day, completely excluding all transactions that occur on the last day of the comparison window.
- **Side Effect:** Depending on server timezone vs UTC, `.toISOString().split("T")[0]` on a `23:59:59` local date could also bleed into the 1st of the next month, causing erratic bound inclusions.

## 3. Clean Code & Architectural Improvements (DRY Violations)

### 3.1 Unnecessary Recalculation in Portfolio Metrics
- **File:** `lib/domain/analytics/portfolio.ts` (L233-L245)
- **Issue:** `getCryptoPortfolioMetrics` calls `getCryptoAssetMetrics` and then manually iterates over the results to re-sum `totalValue`, `totalCostBasis`, `totalUnrealizedPnl`, and `costBasisMissingAssets`. All of these exact mathematical aggregations are already computed and returned in the `payload.summary` object by the first function. Re-calculating them is a massive DRY violation and wastes CPU cycles.

### 3.2 Duplicated Transaction Processing Loop
- **Files:** `cash-flow.ts`, `overview.ts`, `reports.ts`
- **Issue:** The exact same loop logic for iterating through transactions, excluding internal transfers (`internalTransferPairIds.has(tx.id)`), classifying the transaction (`classifyCashFlowTransaction`), extracting the absolute amount, and conditionally applying the `usdBrlRate` is repeated verbatim 5 separate times across these files. This core financial logic should be extracted into a shared utility function (e.g., `processTransactionForAnalytics`) to ensure consistency.

### 3.3 Redundant Month Bucket Formatting
- **File:** `lib/domain/analytics/reports.ts` (L319)
- **Issue:** `getSpendingTrendsMetrics` manually concatenates a month string using `${tx.occurredAt.getUTCFullYear()}-${String(...)}`. This perfectly duplicates the logic already abstracted in `formatBucket(date, "month")` found in `lib/domain/analytics/shared.ts`.
