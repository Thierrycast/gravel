# Gravel API Audit Report - `app/api/` Scope

## Executive Summary
This audit evaluated the `app/api/` scope of the Gravel financial application codebase. Several critical security vulnerabilities were discovered, primarily revolving around an absolute absence of authentication on standard API routes. The application also contains race conditions in its webhook processing logic, mathematical risks with JavaScript floats, and architectural deficiencies where manual validations are repeated without standard schemas.

## 1. Critical Security Findings

### 1.1 Complete Lack of Authentication on API Routes
- **Location:** `app/api/**/*.ts` (e.g., `app/api/domain/transactions/create/route.ts`, `app/api/pluggy/transactions/route.ts`, `app/api/settings/route.ts`)
- **Description:** There is no Next.js `middleware.ts` present in the project to guard API endpoints. Furthermore, none of the domain or read-heavy endpoints implement inline session or token checks. As a result, anyone with network access to the application can read bank transaction histories, create manual transactions, read/write configuration (including settings like Telegram bot tokens), and generate Pluggy connect tokens.
- **Recommendation:** Implement a Next.js `middleware.ts` to protect `/api/domain/*`, `/api/pluggy/*`, and `/api/settings/*` via session validation or basic auth (given its CasaOS/local deployment nature).

### 1.2 Webhook Information Disclosure
- **Location:** `app/api/webhooks/pluggy/route.ts` (Lines 113-141)
- **Description:** The `GET` endpoint for the webhook route returns the most recent 20 webhooks and processing statistics. Unlike the `POST` endpoint, which verifies `WEBHOOK_SECRET_HEADER`, or the sync/register routes which use `ensureInternalApiKey`, this `GET` endpoint is completely unauthenticated and exposes internal `itemId`s and webhook payload details.
- **Recommendation:** Guard the `GET` endpoint with `ensureInternalApiKey` or an equivalent strict authentication mechanism.

### 1.3 Timing Attack Vulnerability in Internal Auth
- **Location:** `lib/admin/internal-auth.ts` (used by `app/api/providers/pluggy/sync/full/route.ts`, `app/api/webhooks/pluggy/register/route.ts`, etc.)
- **Description:** The `INTERNAL_API_KEY` is checked using standard string inequality (`incomingKey !== configuredKey`). This is vulnerable to timing attacks, allowing an attacker to theoretically guess the internal API key character by character based on request response times.
- **Recommendation:** Replace `!==` with Node's `crypto.timingSafeEqual` (or reuse the `constantTimeEquals` helper already present in `lib/ingestion/webhook-registry.ts`).

## 2. Logical Bugs & Race Conditions

### 2.1 Webhook Idempotency Race Condition (TOCTOU)
- **Location:** `app/api/webhooks/pluggy/route.ts` (Lines 67-103)
- **Description:** The webhook handler attempts to prevent duplicate processing by checking for an existing event with `prisma.pluggyWebhookEvent.findUnique`. If not found, it runs an `upsert`. This is a Time-Of-Check to Time-Of-Use (TOCTOU) race condition. If two identical webhook retries arrive at the exact same millisecond, both will pass the `findUnique` check, both will run `upsert` (one creates, the second updates without altering the data), and both will enqueue the event using `after(...)`, causing the background worker to execute `processQueuedWebhookEvent` twice concurrently for the same event ID.
- **Recommendation:** Remove the `findUnique` check. Rely entirely on a single database atomic operation. Use Prisma's `create` inside a `try/catch` block handling the `P2002` (Unique Constraint Violation) error, and only trigger `after()` when the row is successfully created.

### 2.2 Financial Math & Float Precision Risks
- **Location:** `app/api/domain/transactions/create/route.ts` (Lines 16-18, 45)
- **Description:** The route parses the incoming JSON body where `amount` is a standard JavaScript floating-point number. It then directly persists it via Prisma. While Prisma uses `Decimal` internally (as seen in the SQLite schema), accepting floats directly without strict decimal rounding (e.g., `Math.round(amount * 100) / 100`) can lead to precision errors typical of IEEE-754 floats being cast to Database Decimals (e.g., `10.150000000000002`).
- **Recommendation:** Sanitize and strictly round monetary inputs to 2 decimal places before saving, or, even better, accept and process inputs in cents (integers) to completely avoid floating-point irregularities.

## 3. Architecture & Clean Code Deficiencies

### 3.1 DRY Violation: Manual Body Validation
- **Location:** `app/api/domain/transactions/create/route.ts` (Lines 10-36), `app/api/splits/route.ts` (Lines 58-82)
- **Description:** Request body validation is performed manually using verbose `typeof`, `.trim()`, and basic `isNaN(Date.getTime())` checks. This creates fragile code and duplicates validation rules across the API.
- **Recommendation:** Adopt `zod` schemas for all API payloads. This ensures strict type safety at the API boundary, enforces data integrity (like minimum values and exact string unions), and significantly cleans up the route handlers.

### 3.2 Repeated Integration Scaffolding
- **Location:** `app/api/pluggy/transactions/route.ts` (Lines 18-45), `app/api/pluggy/accounts/route.ts` (Lines 12-34)
- **Description:** API routes that proxy requests to the Pluggy provider repeat the exact same bootstrapping logic: parsing search params, validating `itemId`, resolving stored items, calling `fetchItem`, and mapping over `isReady`.
- **Recommendation:** Abstract this preamble into a reusable higher-order function or a domain service method (e.g., `getReadyPluggyItems(requestUrl)`) to clean up the API layer and consolidate external provider logic.
