# Backend - Arquitetura

## Camadas
- `lib/integrations/*`
  - clientes brutos de Pluggy e Binance
- `lib/ingestion/*`
  - sync manual, locks, checkpoints e execucao operacional
- `lib/domain/*`
  - projetores, queries e metricas da aplicacao
- `lib/admin/*`
  - protecao interna e operacao de sync
- `lib/core/*`
  - resposta padronizada, serializacao e filtros

## Rotas principais
- `app/api/providers/*`
  - health, status e sync dos provedores
- `app/api/domain/*`
  - read models da aplicacao
- `app/api/domain/metrics/*`
  - calculos de dashboard e relatorios
- `app/api/admin/*`
  - operacao, rebuild e regras internas

## Protecao interna
- Endpoints administrativos e novos endpoints de sync exigem header:

```bash
X-INTERNAL-API-KEY: <valor de INTERNAL_API_KEY>
```

## Banco
- Dados continuam em 3 niveis:
  - provider snapshots
  - provider records
  - domain read models
- Provider records seguem `insert-only`
- Domain read models usam `upsert` controlado e preservam enriquecimento interno

## Rebuild
- O dominio pode ser reconstruido sem bater no provedor:

```bash
curl -X POST http://localhost:3000/api/admin/rebuild/domain-read-models \
  -H 'X-INTERNAL-API-KEY: ...'
```

## Fluxo recomendado
1. Sincronizar Pluggy e Binance via `providers/*/sync/*`
2. Projetar automaticamente para o dominio
3. Ler a aplicacao via `domain/*` e `domain/metrics/*`
4. Operar regras e manutencao via `admin/*`

## Metricas implementadas
- `GET /api/domain/metrics/overview`
- `GET /api/domain/metrics/cash-flow`
- `GET /api/domain/metrics/net-worth`
- `GET /api/domain/metrics/accounts/allocation`
- `GET /api/domain/metrics/bills/summary`
- `GET /api/domain/metrics/spending/categories`
- `GET /api/domain/metrics/spending/merchants`
- `GET /api/domain/metrics/crypto/assets`
- `GET /api/domain/metrics/crypto/overview`

Detalhes e formulas em `docs/domain-metrics.md`.
