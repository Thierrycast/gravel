# Domain Metrics - Calculos da Aplicacao

## Objetivo
- Concentrar calculos de dashboard, relatorios e comparativos em cima do banco local.
- Aceitar filtros desde agora para evitar retrabalho quando a UI ganhar mais visoes.
- Manter Pluggy e Binance apenas como fontes de ingestao.

## Principios
- A UI deve ler `app/api/domain/*` e `app/api/domain/metrics/*`.
- Sempre que possivel, os calculos usam `from`, `to`, `period`, `accountId`, `categoryId`, `merchantId`, `provider` e `asset`.
- Valores monetarios e quantidades saem serializados como string decimal.
- Datas saem em ISO UTC.

## Filtros suportados
- `from`
  - data inicial ISO. Ex.: `2026-01-01T00:00:00.000Z`
- `to`
  - data final ISO. Padrao: agora.
- `period`
  - atalhos: `7d`, `30d`, `90d`, `180d`, `365d`, `12m`, `mtd`, `month`, `ytd`, `all`
- `page`, `pageSize`
  - paginacao para endpoints com lista
- `provider`
  - `PLUGGY` ou `BINANCE`
- `accountId`
  - filtra contas/transacoes/faturas do dominio
- `categoryId`
  - filtra transacoes/categorias
- `merchantId`
  - filtra transacoes/comerciantes
- `asset`
  - filtra ativo cripto
- `groupBy`
  - `day`, `week`, `month`
- `limit`
  - limite para rankings e listas resumidas
- `ignored`
  - quando `true`, inclui transacoes marcadas como ignoradas

## Endpoints de metricas

### `GET /api/domain/metrics/overview`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/overview?period=mtd'
```
Retorna:
- `accountBalance`
- `investmentsTotal`
- `cryptoTotal`
- `openBills`
- `netWorth`
- `monthlyInflow`
- `monthlyOutflow`
- `monthlyNet`
- `periodInflow`
- `periodOutflow`
- `periodNet`
- `counts`
- `appliedFilters`

### `GET /api/domain/metrics/cash-flow`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/cash-flow?period=12m&groupBy=month'
```
Retorna pontos de serie temporal com:
- `period`
- `inflow`
- `outflow`
- `net`
- `transactions`

### `GET /api/domain/metrics/net-worth`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/net-worth?period=12m'
```
Retorna:
- `current`
- `points`
- `appliedFilters`

### `GET /api/domain/metrics/accounts/allocation`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/accounts/allocation?limit=20'
```
Retorna:
- `total`
- `byAccount`
- `byKind`
- `counts`

### `GET /api/domain/metrics/bills/summary`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/bills/summary?period=90d'
```
Retorna:
- `totalAmount`
- `minimumPayment`
- `overdueAmount`
- `dueIn7DaysAmount`
- `dueIn30DaysAmount`
- `counts`
- `upcoming`
- `appliedFilters`

### `GET /api/domain/metrics/spending/categories`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/spending/categories?period=mtd&limit=10'
```
Retorna ranking de saidas por categoria com:
- `categoryId`
- `name`
- `amount`
- `count`
- `averageAmount`
- `sharePercent`

### `GET /api/domain/metrics/spending/merchants`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/spending/merchants?period=mtd&limit=10'
```
Retorna ranking de saidas por comerciante com:
- `merchantId`
- `name`
- `cnpj`
- `amount`
- `count`
- `averageAmount`
- `sharePercent`

### `GET /api/domain/metrics/crypto/assets`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/crypto/assets?period=all&page=1&pageSize=20'
```
Retorna por ativo:
- `asset`
- `quoteAsset`
- `quantity`
- `currentPrice`
- `currentValue`
- `averageCost`
- `totalCostBasis`
- `unrealizedPnl`
- `unrealizedPnlPercent`
- `realizedPnl`
- `periodRealizedPnl`
- `periodTradeCount`
- `periodBuyCount`
- `periodSellCount`
- `periodBuyQuantity`
- `periodSellQuantity`
- `averageBuyPrice`
- `averageSellPrice`
- `firstTradeAt`
- `lastTradeAt`
- `tradeCount`

Observacoes:
- O `averageCost` usa custo medio movel por ativo.
- O calculo respeita `to` e, por padrao, considera toda a vida do ativo quando `period=all`.
- `from` e `period` controlam os contadores e medias do periodo, enquanto a posicao usa historico ate `to`.
- Comissao em `quoteAsset` entra no custo/provento. Comissao em `baseAsset` ajusta a quantidade. Outras moedas de comissao ficam fora do custo por enquanto.

### `GET /api/domain/metrics/crypto/overview`
Uso:
```bash
curl 'http://localhost:3000/api/domain/metrics/crypto/overview?period=all'
```
Retorna:
- `totalValue`
- `totalCostBasis`
- `totalUnrealizedPnl`
- `totalRealizedPnl`
- `totalUnrealizedPnlPercent`
- `assets`
- `allocations`
- `bestPerformer`
- `worstPerformer`
- `appliedFilters`

## Formula principal de cripto
- Compra:
  - quantidade aumenta
  - custo total aumenta por `price * quantity`
  - se comissao vier na moeda de cotacao, entra no custo
  - se comissao vier no proprio ativo, reduz a quantidade liquida recebida
- Venda:
  - custo removido usa custo medio corrente, nao preco de venda
  - `realizedPnl = proceeds - costRemoved`
  - se comissao vier na moeda de cotacao, reduz o provento
  - se comissao vier no proprio ativo, reduz a quantidade restante
- `averageCost = totalCost / quantity`
- `unrealizedPnl = currentValue - totalCostBasis`

## Proximos calculos naturais
- recorrencia candidata por merchant/descricao/valor
- series por categoria
- PnL realizado por periodo e por ativo
- score de concentracao patrimonial
- metas vs realizado por categoria

## Derivados top-level

### `GET /api/portfolio`
Retorna uma visao consolidada de patrimonio com:
- `summary`
- `accounts`
- `investments`
- `crypto`
- `loans`
- `recurring`
- `history`

### `GET /api/projection`
Retorna projeção deterministica por mes com:
- `summary.startBalance`
- `summary.projectedFinalBalance`
- `points[]`

A projeção considera:
- saldo liquido atual
- recorrencias detectadas/manuais
- faturas futuras

### `GET /api/recurring`
Retorna recorrencias derivadas do historico local.

Observacoes:
- a deteccao atual foca em padroes mensais
- transferencias sao ignoradas
- tolerancia de valor: 15% ou R$ 20, o que for maior
- minimo padrao: 3 ocorrencias
