# Changelog

## Unreleased
- Fixed persistence issue where the resolved institution name for "MeuPluggy" connections would revert to the generic name upon synchronization.
- Foreign-currency purchases are now ingested using the amount actually charged to the account (`amountInAccountCurrency`, BRL) instead of the raw foreign amount; added a backfill script for existing records.
- Card bill payment outflows ("Pagamento de fatura") are no longer counted as expenses — card purchases already count individually, so the payment leg was doubling monthly spending.
- Salary patterns are no longer split on `|`/`,`/`;` (bank descriptions contain those characters); a pattern like "Transferência Recebida|NAME" no longer turns every incoming transfer into income.
- Crypto totals are converted USDT→BRL inside `getOverviewMetrics`, so web UI, MCP, CLI and the portfolio page all report identical net worth (portfolio previously double-converted and showed ~4x the real crypto value).
- Self-transfer pair detection excludes both legs of same-amount/same-counterparty transfers from income, expenses and recurring detection.
- Prisma interactive transactions in sync projectors got explicit timeouts (P2028 crashes on large batches).
- Regenerated derived caches (portfolio history snapshots and detected recurring rules) that had been computed with the old classification.
