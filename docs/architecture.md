# Arquitetura

## Visao Geral

Gravel Finance e uma aplicacao local-first: todos os dados financeiros sao sincronizados de provedores externos e armazenados em SQLite. A UI le exclusivamente do banco local.

```
Pluggy ──┐
          ├── Ingestao ── Provider Records ── Enrichment ── Projecao ── Domain Read Models ── Metricas ── UI
Binance ─┘
```

## Camadas

### 1. Integracoes (`lib/integrations/`)
Clientes HTTP para Pluggy e Binance. Fazem chamadas brutas as APIs externas e retornam dados crus.

### 2. Ingestao (`lib/ingestion/`)
Orquestracao de sync: adquire locks, chama integracoes, persiste snapshots e records, projeta para o dominio, atualiza checkpoints.

### 3. Dominio (`lib/domain/`)
- `queries.ts` - consultas aos read models com paginacao e filtros
- `analytics.ts` - calculos de metricas (overview, cash-flow, net-worth, spending, crypto, scenarios)
- `derived.ts` - deteccao de recorrencias, projecao de saldo, portfolio consolidado
- `installments.ts` - detector central de parcelamento explicito e por similaridade conservadora
- `enrichment/*` - normalizacao, Pluggy Categorize, Logo.dev e helpers raw/enriched/effective
- `ai-engine.ts` - insights comportamentais e custo de oportunidade
- `forensics.ts` - analise estatistica (Benford's Law) e deteccao de assinaturas ocultas
- `crypto-math.ts` - custo medio movel e PnL de cripto

### 4. Admin (`lib/admin/`)
- `ops.ts` - locks de sync, runs, checkpoints, failures
- `internal-auth.ts` - protecao de endpoints administrativos via `X-INTERNAL-API-KEY`

### 5. Core (`lib/core/`)
- `http.ts` - respostas padronizadas (`jsonOk`, `jsonError`) com serializacao de Decimal/Date
- `filters.ts` - parsing de parametros de query (paginacao, datas, booleanos)

## Banco de Dados

Tres niveis de persistencia:

### Provider Snapshots
Payload bruto das APIs externas. Insert-only, deduplicado por hash. Permite reprocessamento sem rebater no provedor.
- `PluggyPayloadSnapshot`
- `BinanceAccountSnapshot`, `BinanceAssetBalanceSnapshot`, `BinanceAssetPriceSnapshot`

### Provider Records
Dados normalizados do provedor. Insert-only (nao sobrescreve enriquecimentos internos).
- `PluggyAccountRecord`, `PluggyTransactionRecord`, `PluggyBillRecord`, `PluggyInvestmentRecord`, `PluggyLoanRecord`, `PluggyCategoryRecord`, `PluggyMerchantRecord`
- `BinanceAssetRecord`, `BinanceTradeRecord`

### Domain Read Models
Dados projetados e enriquecidos para consumo da aplicacao. Upsert controlado.
- `DomainAccount`, `DomainTransaction`, `DomainBill`, `DomainInvestment`, `DomainCryptoAsset`, `DomainCategory`, `DomainMerchant`, `DomainRecurringRule`
- `TransactionEnrichment` - cache do Pluggy Enrichment/Categorize por transacao de dominio
- `MerchantEnrichment` - cache server-side de dominio/logo/describe do Logo.dev por merchant de dominio
- `TransactionInstallmentGroup` - agrupamento logico de compras parceladas, mantendo cada parcela como transacao propria
- `DomainLend` - registro de dívidas de terceiros/amigos
- `DomainScenarioEvent` - eventos hipotéticos para simulações

## Raw, Enriched e Effective

Transacoes preservam a descricao/categoria/merchant originais do provedor nos records Pluggy. A projecao de dominio aplica a ordem:

1. override do usuario ou regra local (`CategoryRule`, `MerchantAliasRule`)
2. dado Pluggy original
3. `TransactionEnrichment` quando o Pluggy Categorize retornar categoria/merchant complementar
4. fallback `Nao categorizado`

As APIs de leitura expõem campos de display ja resolvidos (`displayTitle`, `displaySubtitle`, `effectiveCategory`, `effectiveMerchant`, `merchantLogoUrl`) para evitar regra duplicada no client.

## Enrichment e Logos

Pluggy Categorize roda somente no backend usando a API key Pluggy cacheada. Lotes sao processados por tipo de conta, resultados recentes `SUCCESS`/`UNMATCHED` e erros recentes nao sao reenviados agressivamente, e uma rodada bem-sucedida reprojeta os read models Pluggy. Logo.dev usa `LOGO_DEV_SECRET_KEY` apenas em chamadas server-side de Describe e entrega para UI somente URLs CDN com `LOGO_DEV_PUBLISHABLE_KEY`.

Agregados financeiros nao misturam moedas silenciosamente. Totais fiat sao calculados em BRL; cripto e valores USD sao convertidos explicitamente ou exibidos separados por moeda nas telas de investimento.

Comandos admin protegidos:

```bash
curl -X POST http://localhost:3000/api/admin/enrichment/pluggy/run \
  -H 'X-INTERNAL-API-KEY: ...'

curl -X POST http://localhost:3000/api/admin/enrichment/logo/run \
  -H 'X-INTERNAL-API-KEY: ...'

curl -X POST http://localhost:3000/api/admin/domain/rebuild-installments \
  -H 'X-INTERNAL-API-KEY: ...'
```

### Dados da Aplicacao
Criados diretamente pela UI, sem dependencia de provedores.
- `Goal` - metas financeiras
- `Tag`, `TransactionTag` - tags livres em transacoes
- `CategoryRule` - regras de categorizacao automatica
- `MerchantAliasRule` - regras de alias de comerciante
- `IgnoredTransaction` - transacoes excluidas de relatorios
- `UserSetting` - configurações de preferências, salário e segurança

### Operacional
- `OpsSyncRun`, `OpsSyncFailure`, `OpsSyncCheckpoint`, `OpsSyncLock`, `DomainSyncState`
- `PluggyItem`, `PluggySyncRun`, `BinanceSyncRun`

## Segurança & Vault

A aplicação implementa uma camada de proteção local (`VaultProvider`) para garantir a privacidade dos dados em ambientes compartilhados.
- **Master Password**: Senha mestre protegida por hash no banco de dados.
- **VaultProvider**: Context Provider que envolve a aplicação e intercepta a renderização caso o cofre esteja bloqueado.
- **Panic Mechanism**: Listener global para a tecla `Escape` que aciona o bloqueio imediato.
- **Auto-Lock**: Timer de inatividade monitorado via eventos de mouse/teclado.

## Fluxo de Sync

1. Adquirir lock para evitar execucoes concorrentes
2. Buscar dados novos dos provedores (Pluggy e/ou Binance)
3. Persistir snapshots brutos e records normalizados
4. Projetar records para domain read models (com regras de categoria e merchant alias)
5. Recalcular derivados (recorrencias, portfolio, projecao)
6. Atualizar checkpoints e liberar lock

```bash
# Sync completo
curl -X POST http://localhost:3000/api/admin/sync/full \
  -H 'X-INTERNAL-API-KEY: ...'
```

## Rotas

### Publicas (leitura)
- `app/api/domain/*` - read models com paginacao
- `app/api/domain/metrics/*` - calculos e agregacoes
- `app/api/goals`, `app/api/tags` - dados da aplicacao
- `app/api/recurring`, `app/api/projection`, `app/api/portfolio` - derivados

### Protegidas (admin)
Exigem header `X-INTERNAL-API-KEY`:
- `app/api/admin/*` - rebuild, reprocess, regras, sync
- `app/api/providers/*` - sync dos provedores

### Internas (provedor)
- `app/api/pluggy/*` - acesso direto ao Pluggy
- `app/api/binance/*` - acesso direto a Binance

## Frontend

- Next.js App Router com paginas client-side ("use client")
- `VaultProvider` para controle de acesso e privacidade
- `useApi` hook customizado para data fetching com loading/error/refetch
- shadcn/ui para componentes base
- Recharts para graficos (line, area, bar, pie, composed, scatter)
- d3-sankey para diagrama de fluxo financeiro
- Temas Premium: Cyberpunk e Emerald (OKLch CSS Variables)
- Sidebar responsiva com logo premium em SVG
