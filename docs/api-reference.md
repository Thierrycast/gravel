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

## Faturas de cartão (ciclo de fatura)

`GET /api/domain/cards/statements[?accountId=...]`

Retorna, por cartão de crédito, as faturas calculadas pelo motor de ciclo
(`lib/domain/billing.ts`): `current` (fatura do ciclo vigente), `upcoming`
(futuras, a partir das parcelas já conhecidas), `past` (fechadas/pagas),
`totalOpen`, `closingDay`, `dueDay`, `suggestedDueDay` e `configured`.
Cartões sem `billingClosingDay`/`billingDueDay` retornam `configured: false`
e a UI exibe o aviso de configuração.

Status possíveis de uma fatura: `OPEN`, `CLOSED`, `OVERDUE`, `PAID`, `FUTURE`.

`PUT /api/domain/accounts/{accountId}`

Além de `nickname`, aceita `billingClosingDay` e `billingDueDay`
(inteiros 1–31 ou `null` para limpar).

## Recorrências

- `GET /api/recurring` — regras detectadas + manuais (totais em equivalente mensal).
- `POST /api/recurring` — cria regra manual (`name`, `amount`, `interval`, `nextDate`, `direction`, `categoryId?`).
- `PATCH /api/recurring/{id}` — edita regra (editar uma detectada converte a origem para `manual`).
- `DELETE /api/recurring/{id}` — regra manual é removida; detectada vira marcador inativo `dismissed`, que impede a redetecção automática.
- `GET /api/recurring/income` — recorte de receitas recorrentes.

## Projeção

`GET /api/projection?months=3|6|12`

Meses futuros com componentes separados (`income`, `recurringExpenses`,
`cardBills`, `installments`, `variableExpenses`). Cartões com ciclo
configurado usam exclusivamente o motor de faturas (sem dupla contagem com
parcelas detectadas/bills). O `summary` expõe `currentMonthAdjustment`
(fluxos conhecidos até o fim do mês corrente aplicados ao saldo inicial),
`overdueStatements`, `firstNegativeMonth` e `goalCommitmentMonthly`.

## Relatórios consolidados

`GET /api/domain/metrics/reports`

Uma passada sobre as transações de 12 meses alimenta: `monthlyFlow`,
`spendingByAccount`, `topExpenses`, `categoryDeltas`, `billsByMonth`,
`recurringSummary` e `health` (score 0–100 combinando taxa de poupança e
dívida de cartão sobre a renda).

## Pessoas e divisões de conta

- `GET /api/people` — pessoas cadastradas com métricas (a receber, recebido, itens); faz backfill automático a partir de empréstimos antigos.
- `POST /api/people` / `PATCH /api/people/{id}` / `DELETE /api/people/{id}` — CRUD (DELETE retorna 409 se houver pendências).
- `GET /api/splits` — contas divididas com partes por pessoa e status.
- `POST /api/splits` — `{ title, totalAmount, date?, domainTransactionId?, shares: [{ personId, amount }] }`; a diferença entre o total e a soma das partes é a parte do próprio usuário.
- `PATCH /api/splits/{id}` — `{ shareId, status: "PAID"|"PENDING" }`.
- `POST /api/lends` aceita `personId` (preferido) ou `friendName` legado (cria/reusa a pessoa).

## Cripto

`GET /api/crypto/history?days=90`

Evolução diária do valor da carteira em BRL, reconstruída dos snapshots de
saldo/preço da Binance (forward-fill). `summary` traz variação, pico e fundo
do período.

## Insights

`GET /api/insights`

Além de `nudges` e `forensics`, retorna `actions`: lista priorizada de ações
recomendadas (fatura vencida/vencendo, saldo projetado negativo, metas acima
da sobra, cartão sem ciclo configurado), cada uma com `severity`, `href` e
rótulo do botão.

## Classificação de renda e padrões de salário

`classifyCashFlowTransaction` aceita `options.salaryPatterns`: uma entrada
(INFLOW) que casa um padrão de salário do usuário é classificada como renda
mesmo quando a categoria indica transferência entre contas próprias. Alterar
padrões de salário (via settings ou "marcar como salário" numa transação)
força a re-detecção de recorrências.

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
