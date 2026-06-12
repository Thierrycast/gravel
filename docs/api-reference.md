# API Reference

## Dashboard e transações

- `GET /api/domain/metrics/overview`
- `GET /api/domain/metrics/cash-flow`
- `GET /api/domain/metrics/cash-flow/compare`
- `GET /api/domain/metrics/spending/categories`
- `GET /api/domain/transactions`

Filtros semânticos de transações:

- `semantic=real-income`
- `semantic=real-expense`
- `semantic=internal-transfer`
- `semantic=bill-payment`

Flags relevantes:

- `showFutureSalary=true|false`
- `showFutureAccounts=true|false`

## Inbox

`GET /api/inbox`

Retorna `summary` e `results` com itens de revisão.

`PATCH /api/inbox`

```json
{
  "id": "tx-uncategorized-...",
  "status": "resolved"
}
```

Status aceitos: `open`, `resolved`, `ignored`.

## Fechamento mensal

`GET /api/monthly-close?month=2026-06`

Retorna checklist e resumo do mês.

`PATCH /api/monthly-close`

```json
{
  "month": "2026-06",
  "stepId": "categories",
  "completed": true
}
```

`POST /api/monthly-close`

```json
{
  "month": "2026-06"
}
```

Persiste o resumo final quando todas as etapas foram revisadas pela UI.
