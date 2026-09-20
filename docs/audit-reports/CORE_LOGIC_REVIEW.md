# Core Logic Audit Report: lib/domain/

**Date:** 2026-09-20
**Scope:** lib/domain/ (Focus: eview.ts, derived.ts, installments.ts, ecurring.ts, 
otifications.ts)

## 1. Executive Summary
The audit of the core domain logic revealed significant vulnerabilities related to idempotency in notifications, date math degradation, and hardcoded assumptions in salary parsing. Furthermore, structural bloat in derived.ts represents a substantial technical debt risk. Addressing the notification spam bug and the false positives in installments/salary detection should be immediate priorities.

## 2. Critical Logical Bugs

### 2.1 Notification Spam on Read Operations (Missing Idempotency)
- **File:** 
otifications.ts (lines 256-261, 289-294) and eview.ts (lines 428-438)
- **Issue:** checkBudgetAnomalies() is called by getInboxPayload() in eview.ts, which is a data-fetching endpoint usually hit on page loads. Inside checkBudgetAnomalies(), any detected anomaly immediately fires 	riggerNotificationDelivery() (Push, Slack, ntfy, Telegram).
- **Impact:** Because there is no state tracking or idempotency check (e.g., hasNotifiedThisMonth), the user will be spammed with notifications *every single time* they refresh the dashboard/inbox while an anomaly exists.
- **Recommendation:** Decouple anomaly detection from notification delivery. Run notifications in a background cron job with idempotency records, or store an lertSentAt timestamp in the database.

### 2.2 Hardcoded Projection Divisor for Variable Expenses
- **File:** derived.ts (line 700)
- **Issue:** The variable expenses average is hardcoded to divide by 3: 	otalVariableOutflow.div(3). This assumes the user always has a full 90-day history (based on PROJECTION.VARIABLE_EXPENSE_LOOKBACK_DAYS).
- **Impact:** For a new user with only 1 month of transaction history, their projected variable expenses will be divided by 3, making the projections artificially 3x lower than reality.
- **Recommendation:** Dynamically calculate the divisor based on the actual date range of the user's available transaction history, clamping to a minimum of 1.

### 2.3 Date Degradation in Recurring Math
- **File:** derived.ts (line 387) and ecurring.ts (lines 73-83)
- **Issue:** The recurrence engine updates 
extDate iteratively (e.g., 
extDate = addMonths(nextDate, 1)). If a rule anchors on the 31st, but lands on February, the date is clamped to the 28th. Subsequent iterative updates will use the 28th as the new base, permanently shifting the billing date backwards.
- **Impact:** Long-term recurring projections will drift from the actual billing dates.
- **Recommendation:** Implement an nchorDay (1-31) property on DomainRecurringRule to ensure the target day is preserved across varying month lengths.

## 3. False Positives & Unhandled Edges

### 3.1 Date Formats Misclassified as Explicit Installments
- **File:** installments.ts (lines 8-9, 28-36)
- **Issue:** xplicitInstallmentPattern uses the regex /(?:^|\D)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})(?:\D|$)/i.
- **Impact:** Common Brazilian date formats in descriptions, such as "Compra em 01/12", perfectly match this pattern (Current: 1, Total: 12). Since 1 < 12 is mathematically valid, the logic flags dates as explicit installments.
- **Recommendation:** Enhance the regex or parsing logic to exclude exact match dates or require specific installment keywords (e.g., "parc", "x").

### 3.2 Salary Hardcoded to Monthly Interval
- **File:** derived.ts (lines 294-309, 329)
- **Issue:** The salary detection logic explicitly reduces salary groups to the single largest transaction per month and forces detectedInterval = "MONTHLY".
- **Impact:** This ignores users who are paid bi-weekly or receive "adiantamento quinzenal" (e.g., 40% on the 15th, 60% on the 5th). The system will discard the smaller paycheck and severely underestimate their projected cash flow.
- **Recommendation:** Allow BIWEEKLY or multiple salary signatures per month instead of unconditionally discarding intra-month salary events.

### 3.3 Generic Descriptions Triggering Salary Reviews
- **File:** eview.ts (lines 301-304)
- **Issue:** In getInboxPayload, unconfirmed salary candidates are clustered using 
ormalizeText(tx.merchantName ?? tx.description ?? tx.normalizedDescription).
- **Impact:** If merchantName is null, highly generic descriptions like "Pix Recebido" or "Transferencia recebida" will cluster entirely unrelated deposits from different months into a single group, triggering a false "salary-unconfirmed" inbox task.
- **Recommendation:** Include the sender's document/ID in the grouping key for inflow transactions, or skip clustering for known generic fallback texts.

## 4. Architectural Issues & Clean Code Improvements

### 4.1 God Object Anti-Pattern in derived.ts
- **Issue:** derived.ts is over 1,260 lines long and handles disparate core domains: anomaly detection, recurring transaction AI clustering, smart installment inference mapping, and balance projections (getProjectionPayload).
- **Recommendation:** Extract domains to their respective modules. For instance, getProjectionPayload and projection compilation logic should be moved into projectors.ts (which currently exists but appears underutilized).

### 4.2 Scalability Bottleneck in Recurring History Processing
- **File:** derived.ts (line 168-176)
- **Issue:** efreshRecurringDerived loads a full 365-day transaction history into Node.js memory (prisma.domainTransaction.findMany) to execute similarity clustering. For power users with high transaction volumes, this will strain RAM and block the event loop.
- **Recommendation:** Shift the initial grouping and variance math to database-level aggregations (using Prisma's groupBy or raw SQL) or process candidates in chunks/streams.
