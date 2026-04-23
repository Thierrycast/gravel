# API Reference

Todos os endpoints da aplicacao. Valores monetarios retornam como string decimal. Datas em ISO UTC.

## Filtros Comuns

| Param | Descricao | Exemplo |
|-------|-----------|---------|
| `from` | Data inicial ISO | `2026-01-01T00:00:00.000Z` |
| `to` | Data final ISO | `2026-03-15T23:59:59.999Z` |
| `period` | Atalho de periodo | `7d`, `30d`, `90d`, `180d`, `365d`, `mtd`, `ytd`, `all` |
| `page` | Pagina atual | `1` |
| `pageSize` | Itens por pagina | `20` |
| `groupBy` | Agrupamento temporal | `day`, `week`, `month` |
| `accountId` | Filtro por conta | ID da DomainAccount |
| `categoryId` | Filtro por categoria | ID da DomainCategory |
| `merchantId` | Filtro por comerciante | ID do DomainMerchant |
| `provider` | Filtro por provedor | `PLUGGY`, `BINANCE` |
| `asset` | Filtro por ativo crypto | `BTC`, `ETH` |

---

## Domain - Read Models

### `GET /api/domain/accounts`
Lista contas do dominio.

### `GET /api/domain/transactions`
Lista transacoes. Suporta filtros por data, conta, categoria, merchant.

### `GET /api/domain/transactions/export`
Exporta transacoes como CSV. Mesmos filtros do endpoint acima.

### `POST /api/domain/transactions/create`
Cria transacao manual.
```json
{ "description": "Mercado", "amount": 150.50, "direction": "OUTFLOW", "occurredAt": "2026-03-15", "domainAccountId": "...", "domainCategoryId": "..." }
```

### `GET /api/domain/transactions/:id`
Detalhes de uma transacao.

### `PUT /api/domain/transactions/:id`
Atualiza transacao. Campos permitidos: `domainCategoryId`, `description`, `ignored`.

### `GET /api/domain/categories`
Lista categorias.

### `GET /api/domain/bills`
Lista faturas. Filtros por data.

### `GET /api/domain/investments`
Lista investimentos.

### `GET /api/domain/merchants`
Lista comerciantes.

---

## Domain - Metricas

### `GET /api/domain/metrics/overview`
Resumo financeiro: saldos, investimentos, crypto, faturas, fluxo de caixa.

### `GET /api/domain/metrics/cash-flow`
Serie temporal de fluxo de caixa. Params: `groupBy=month`, `months=6`.

### `GET /api/domain/metrics/net-worth`
Patrimonio liquido com historico de snapshots.

### `GET /api/domain/metrics/accounts/allocation`
Alocacao de saldo por conta e por tipo.

### `GET /api/domain/metrics/bills/summary`
Resumo de faturas: totais, vencidas, proximas, contagens.

### `GET /api/domain/metrics/spending/categories`
Ranking de gastos por categoria com percentual e contagem.

### `GET /api/domain/metrics/spending/merchants`
Ranking de gastos por comerciante com percentual e contagem.

### `GET /api/domain/metrics/crypto/assets`
Metricas por ativo crypto: custo medio, PnL realizado e nao realizado, contadores de trades.

### `GET /api/domain/metrics/crypto/overview`
Resumo consolidado da carteira crypto: valor total, alocacao, melhor/pior performer.

---

## Derivados

### `GET /api/recurring`
Recorrencias detectadas e manuais. Filtro opcional por tipo: `/api/recurring/income`, `/api/recurring/expenses`.

### `GET /api/projection`
Projecao de saldo. Param: `months=6`.

### `GET /api/portfolio`
Visao consolidada: ativos, dividas, patrimonio, historico, recorrencias.

### `GET /api/crypto`
Ativos crypto com PnL (formato simplificado).

---

## Aplicacao

### Goals
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/goals` | Listar metas (param `all=true` inclui inativas) |
| POST | `/api/goals` | Criar meta |
| GET | `/api/goals/:id` | Detalhes da meta |
| PUT | `/api/goals/:id` | Atualizar meta |
| DELETE | `/api/goals/:id` | Desativar meta |

### Tags
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/tags` | Listar tags |
| POST | `/api/tags` | Criar tag |
| PUT | `/api/tags/:id` | Atualizar tag |
| DELETE | `/api/tags/:id` | Excluir tag |
| GET | `/api/transactions/:id/tags` | Tags de uma transacao |
| POST | `/api/transactions/:id/tags` | Adicionar tag |
| DELETE | `/api/transactions/:id/tags` | Remover tag |

### Automacoes
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/automations` | Listar regras de categorizacao |
| POST | `/api/automations` | Criar regra |
| PUT | `/api/automations/:id` | Atualizar regra |
| DELETE | `/api/automations/:id` | Excluir regra |

### Sync
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/sync/status` | Status consolidado dos providers |
| GET | `/api/sync/trigger` | Retorna info da ultima execucao (`lastSyncAt`, `syncStatus`) — usado pelo botao de sync na UI |
| POST | `/api/sync/trigger` | Dispara sync Pluggy fire-and-forget (UI de uso pessoal; sem API key) |

---

## Admin (protegidas)

Exigem header `X-INTERNAL-API-KEY`.

| Metodo | Rota | Descricao |
|--------|------|-----------|
| POST | `/api/admin/sync/full` | Sync completo (Pluggy + Binance + rebuild) |
| POST | `/api/admin/rebuild/domain-read-models` | Rebuild do dominio sem rebater no provedor |
| POST | `/api/admin/reprocess/provider-record` | Reprocessar registro individual |
| POST | `/api/admin/rules/category` | Criar regra de categoria |
| POST | `/api/admin/rules/merchant-alias` | Criar alias de comerciante |
| GET | `/api/admin/sync/runs` | Historico de execucoes |
| GET | `/api/admin/sync/checkpoints` | Checkpoints de sync |

---

## Providers

### Pluggy
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/providers/pluggy/health` | Health check |
| GET | `/api/providers/pluggy/status` | Status detalhado |
| POST | `/api/providers/pluggy/sync/full` | Sync completo |
| POST | `/api/providers/pluggy/sync/items` | Sync de itens |
| POST | `/api/providers/pluggy/sync/transactions` | Sync de transacoes |

### Binance
| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/providers/binance/health` | Health check |
| GET | `/api/providers/binance/status` | Status detalhado |
| POST | `/api/providers/binance/sync/full` | Sync completo |
| POST | `/api/providers/binance/sync/trades` | Sync de trades |
| POST | `/api/providers/binance/sync/prices` | Atualizar precos |
