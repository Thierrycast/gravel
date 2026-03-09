# Backend - Arquitetura

## Camadas
- `lib/integrations/*`
  - Clientes brutos de Pluggy e Binance
- `lib/ingestion/*`
  - Sync manual, locks, checkpoints e execucao operacional
- `lib/domain/*`
  - Projetores e queries da aplicacao
- `lib/admin/*`
  - Protecao interna e operacao de sync
- `lib/core/*`
  - Resposta padronizada, serializacao e filtros

## Rotas principais
- `app/api/providers/*`
  - Health, status e sync dos provedores
- `app/api/domain/*`
  - Read models da aplicacao
- `app/api/admin/*`
  - Operacao, rebuild e regras internas

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
2. Ler a aplicacao via `domain/*`
3. Operar regras e manutencao via `admin/*`
