# Frontend Audit Report: Next.js App Router UI
**Scope:** `app/` (React UI Components, Complex Pages: cash-flow, portfolio, crypto, transactions)

## 1. Frontend Bugs & React/Next.js Issues

### Missing Content-Type Header (API Request Failure)
- **Location:** `app/crypto/page.tsx` (Line ~513)
- **Issue:** Inside `handleSaveCost`, a `POST` request is made to `/api/crypto/cost-basis` with a JSON stringified body, but the `headers: { "Content-Type": "application/json" }` is missing. This will cause backend parsing errors (Express/Next.js API routes require this header to parse JSON bodies correctly).

### Next.js Missing Suspense Boundary for `useSearchParams`
- **Location:** 
  - `app/cash-flow/page.tsx` (Line 156: `usePeriod`)
  - `app/portfolio/page.tsx` (Line 280: `usePeriod`)
- **Issue:** Both pages use the custom `usePeriod` hook, which consumes `useSearchParams()`. However, neither page wraps its default export in a `<Suspense>` boundary. In Next.js App Router, using `useSearchParams` in a Client Component without a Suspense boundary forces the entire route to de-opt to client-side rendering during build time, severely degrading initial page load performance.
- **Fix:** Wrap the main content in a Suspense boundary, similar to how it is correctly implemented in `app/transactions/page.tsx`.

### State Management Anti-pattern (Two-way URL Sync)
- **Location:** `app/transactions/page.tsx` (Lines 403-414)
- **Issue:** The component syncs URL query parameters into local state using `useEffect` (e.g., `setSearchInput(query)`). It also contains a debounced `useEffect` that watches local state and pushes back to the URL. This two-way synchronization anti-pattern causes unnecessary re-renders, race conditions, and cursor jumping.
- **Fix:** Use the URL as the single source of truth. Initialize the local input state once from the URL, or use controlled inputs with a dedicated `useDebounce` hook to push changes to the URL without syncing backwards on every change.

## 2. Architecture & Clean Code Improvements

### Missing Local Error Boundaries
- **Location:** `app/cash-flow/`, `app/transactions/`, `app/portfolio/`, `app/crypto/`
- **Issue:** There are no `error.tsx` files inside these complex feature directories. While there is a global `app/error.tsx`, any crash within these complex data-heavy pages will bring down the entire application layout.
- **Fix:** Add a local `error.tsx` boundary in each of these directories to contain failures and provide isolated recovery mechanisms.

### Monolithic Components (Mixed Responsibilities & Excessive Length)
- **Location:** `app/transactions/page.tsx` (1600+ lines)
- **Issue:** The `TransactionsContent` component is massive. It handles data fetching, URL param parsing, debouncing, rendering a desktop table, rendering a mobile list, and rendering a complex editing Sheet. This heavily mixes presentation, business logic, and routing logic.
- **Fix:** Extract components to modularize the page:
  - `TransactionTable` and `TransactionMobileList` for display.
  - `TransactionFilters` for the search and filter UI.
  - `TransactionEditSheet` to encapsulate the editing state (`draft`, `lendDraft`) and API mutation functions (`saveTransactionOverrides`, `createLendFromSelectedTransaction`).

### Inline Chart Complexity
- **Location:** `app/cash-flow/page.tsx` (680+ lines)
- **Issue:** The page defines and configures four distinct Recharts (`AreaChart` for Income, `BarChart` for Investments, Expenses, and Net Result) directly within the main component's JSX return.
- **Fix:** Extract each chart into separate components (e.g., `components/cash-flow/IncomeChart.tsx`) taking `chartData` as props. This will drastically improve the readability of `CashFlowPage` and isolate the Recharts configuration.
