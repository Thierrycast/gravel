# Plano de Implementacao: CLI parruda para analise por IA

## Objetivo

Criar uma CLI local do Gravel capaz de coletar, normalizar, empacotar e exportar dados financeiros, operacionais e tecnicos do projeto em formatos que uma IA consiga consumir com o minimo de adaptacao manual.

A ideia nao e raspar a UI. A ideia e expor o melhor contexto possivel diretamente das camadas que ja existem no projeto:

- `lib/domain/queries.ts`
- `lib/domain/analytics.ts`
- `lib/domain/derived.ts`
- `lib/admin/ops.ts`
- `lib/prisma.ts`
- `docs/*.md`

Essa CLI deve servir tanto para analise financeira quanto para diagnostico tecnico/operacional.

---

## Resultado esperado

Com um unico comando, a CLI deve conseguir gerar um pacote de analise para IA contendo:

- resumo financeiro do periodo
- evidencias e agregados relevantes
- entidades detalhadas em JSON/JSONL
- metadados de proveniencia
- status de sync e saude operacional
- contexto tecnico do projeto
- opcionalmente um `prompt-pack` pronto para colar em um agente

Exemplo de uso desejado:

```bash
pnpm gravel snapshot finance --period 90d --redact safe --out .ai/runs/2026-04-15
pnpm gravel diff .ai/runs/2026-04-01 .ai/runs/2026-04-15
pnpm gravel prompt-pack --input .ai/runs/2026-04-15/analysis-bundle.json
```

---

## Principios de design

- Local-first: ler do SQLite e das camadas de dominio antes de qualquer dependencia externa.
- Reprodutivel: mesma entrada, mesma saida.
- Deterministico: evitar heuristicas opacas no empacotamento.
- Redacao nativa: a CLI precisa saber mascarar PII e dados sensiveis.
- Orientado a evidencia: todo resumo deve apontar para listas, entidades e agregados de suporte.
- Token-aware: gerar bundles compactos e tambem formatos chunkados.
- Extensivel: permitir novos coletores sem reescrever a base.

---

## Casos de uso que a CLI deve cobrir

1. Gerar um bundle completo para uma IA analisar a saude financeira do usuario.
2. Gerar um bundle focado em uma pergunta especifica: gastos, patrimonio, recorrencias, cripto, faturas, projecao.
3. Comparar dois snapshots e explicar o que mudou.
4. Exportar entidades em JSONL para embeddings, fine-tuning interno ou pipelines de RAG.
5. Auditar o estado operacional da aplicacao: syncs, locks, checkpoints, falhas, providers.
6. Produzir contexto tecnico do projeto para um agente de engenharia entender a app sem depender de leitura manual dos docs.

---

## Escopo da V1

### Inclui

- leitura direta do banco via Prisma
- reutilizacao de consultas e metricas do dominio
- exportacao em `json`, `jsonl` e `md`
- redacao configuravel
- snapshots versionados em pasta local
- diff entre snapshots
- prompt-pack para IA
- comandos de saude/diagnostico

### Nao inclui na V1

- mutacao de dados do usuario
- execucao automatica de LLM dentro da CLI
- sync completo dos providers pela CLI como fluxo principal
- streaming em tempo real
- plugin ecosystem externo

Esses itens podem entrar depois.

---

## Decisao tecnica recomendada

Implementar a CLI em TypeScript, no mesmo repositorio, com Node 20.

### Dependencias recomendadas

- `commander` para parse de comandos
- `zod` para schemas de entrada e de saida
- `tsx` para execucao em dev
- `chalk` para output legivel
- `ora` para feedback de progresso
- `cli-table3` para tabelas de terminal
- `p-limit` para concorrencia controlada
- `fast-json-stable-stringify` para saida deterministica

### Por que `commander`

- menor custo de adocao
- pouca magia
- encaixa bem num repositorio que nao nasceu como monorepo de CLI
- suficiente para uma CLI robusta sem o peso estrutural do `oclif`

---

## Estrutura de pastas sugerida

```text
cli/
  index.ts
  commands/
    doctor.ts
    snapshot.ts
    export.ts
    diff.ts
    inspect.ts
    prompt-pack.ts
    ops.ts
    schema.ts
    project.ts
  core/
    config.ts
    env.ts
    logger.ts
    errors.ts
    paths.ts
    manifest.ts
  adapters/
    prisma.ts
    domain-queries.ts
    domain-analytics.ts
    domain-derived.ts
    ops.ts
    docs.ts
  collectors/
    overview.ts
    transactions.ts
    categories.ts
    merchants.ts
    bills.ts
    recurring.ts
    portfolio.ts
    crypto.ts
    projection.ts
    goals.ts
    sync.ts
    project-context.ts
  serializers/
    bundle.ts
    json.ts
    jsonl.ts
    markdown.ts
    prompt-pack.ts
  redaction/
    profiles.ts
    pii.ts
    aliases.ts
  schemas/
    bundle.ts
    entity.ts
    prompt-pack.ts
  utils/
    dates.ts
    chunks.ts
    hash.ts
    sort.ts
```

---

## Comandos principais

### `gravel doctor`

Verifica ambiente e saude local.

Deve checar:

- `.env`
- `DATABASE_URL`
- conectividade com SQLite
- integridade basica do Prisma
- existencia de tabelas principais
- status de providers
- ultimos sync runs
- locks ativos

Exemplo:

```bash
pnpm gravel doctor
pnpm gravel doctor --json
```

### `gravel snapshot finance`

Gera um pacote de analise financeira para IA.

Parametros:

- `--period mtd|30d|90d|180d|12m|ytd|all`
- `--from YYYY-MM-DD`
- `--to YYYY-MM-DD`
- `--include overview,transactions,categories,merchants,bills,recurring,portfolio,crypto,projection`
- `--redact none|safe|strict`
- `--format bundle|json|jsonl|md|all`
- `--out <dir>`
- `--limit-transactions 500`
- `--top 20`

Exemplo:

```bash
pnpm gravel snapshot finance --period 90d --redact safe --format all --out .ai/runs/90d
```

### `gravel export`

Exporta entidades puras para pipelines externos.

Subcomandos sugeridos:

- `gravel export transactions`
- `gravel export categories`
- `gravel export merchants`
- `gravel export bills`
- `gravel export recurring`
- `gravel export portfolio`
- `gravel export crypto`

Exemplo:

```bash
pnpm gravel export transactions --period 12m --format jsonl --out exports/transactions.jsonl
```

### `gravel diff`

Compara dois snapshots e resume mudancas.

Deve comparar:

- patrimonio
- entradas e saidas
- top categorias
- top merchants
- passivos
- recorrencias
- cripto
- status operacional

Exemplo:

```bash
pnpm gravel diff .ai/runs/2026-04-01 .ai/runs/2026-04-15
```

### `gravel inspect`

Inspecao pontual de metricas ou entidades.

Subcomandos:

- `gravel inspect overview`
- `gravel inspect transaction <id>`
- `gravel inspect metric cash-flow`
- `gravel inspect merchant <id>`
- `gravel inspect category <id>`

### `gravel prompt-pack`

Gera um pacote textual otimizado para IA.

Saida sugerida:

- `system-context.md`
- `analysis-brief.md`
- `question-starters.md`
- `evidence-index.json`

Exemplo:

```bash
pnpm gravel prompt-pack --input .ai/runs/90d/analysis-bundle.json --out .ai/prompts/90d
```

### `gravel ops`

Foco em operacao e observabilidade.

Subcomandos:

- `gravel ops status`
- `gravel ops sync-runs`
- `gravel ops checkpoints`
- `gravel ops failures`
- `gravel ops locks`

### `gravel project`

Contexto tecnico do repositorio para agentes de engenharia.

Deve coletar:

- resumo da arquitetura
- modulos principais
- endpoints
- schemas do Prisma
- scripts do `package.json`
- docs existentes

Exemplo:

```bash
pnpm gravel project context --format bundle --out .ai/project-context
```

---

## Formatos de saida que a IA precisa

### 1. `analysis-bundle.json`

Arquivo principal para analise.

Estrutura sugerida:

```json
{
  "metadata": {
    "generatedAt": "2026-04-15T12:00:00.000Z",
    "project": "gravel",
    "version": "0.1.0",
    "redactionProfile": "safe",
    "filters": {
      "period": "90d",
      "from": "2026-01-16",
      "to": "2026-04-15"
    },
    "dataFingerprint": "sha256:..."
  },
  "financial": {
    "overview": {},
    "cashFlow": {},
    "categories": {},
    "merchants": {},
    "bills": {},
    "recurring": {},
    "portfolio": {},
    "crypto": {},
    "projection": {}
  },
  "evidence": {
    "topTransactions": [],
    "topCategories": [],
    "topMerchants": [],
    "alerts": [],
    "anomalies": []
  },
  "ops": {
    "providers": {},
    "sync": {},
    "failures": []
  },
  "project": {
    "architectureSummary": "",
    "apiSurface": [],
    "docsDigest": []
  }
}
```

### 2. `entities/*.jsonl`

Bom para RAG e chunking por entidade.

Arquivos sugeridos:

- `transactions.jsonl`
- `categories.jsonl`
- `merchants.jsonl`
- `bills.jsonl`
- `recurring.jsonl`
- `crypto-assets.jsonl`
- `ops-sync-runs.jsonl`

### 3. `summary.md`

Resumo executivo legivel por humano e IA.

### 4. `prompt-context.md`

Contexto enxuto, pronto para colar em um agente.

### 5. `manifest.json`

Indice do snapshot:

- arquivos gerados
- schemas usados
- contagens
- checksums

---

## Camadas de coleta

### Camada 1: dados financeiros consolidados

Usar preferencialmente:

- `getOverviewMetrics`
- `getCashFlowMetrics`
- `getNetWorthMetrics`
- `getSpendingByCategoryMetrics`
- `getSpendingByMerchantMetrics`
- `getBillsSummaryMetrics`
- `getCryptoAssetMetrics`
- `getCryptoPortfolioMetrics`
- `getPortfolioPayload`
- `getProjectionPayload`

### Camada 2: entidades detalhadas

Usar:

- `getDomainTransactions`
- `getDomainAccounts`
- `getDomainBills`
- `getDomainCategories`
- `getDomainMerchants`
- `getDomainInvestments`
- `getDomainCryptoAssets`

### Camada 3: operacional

Ler diretamente:

- `OpsSyncRun`
- `OpsSyncFailure`
- `OpsSyncCheckpoint`
- `OpsSyncLock`
- `DomainSyncState`
- `PluggyItem`
- `PluggySyncRun`
- `BinanceSyncRun`

### Camada 4: contexto tecnico

Ler:

- `package.json`
- `prisma/schema.prisma`
- `README.md`
- `docs/architecture.md`
- `docs/api-reference.md`
- `docs/features.md`

---

## Redacao e privacidade

Perfis sugeridos:

### `none`

Sem redacao. Uso local e controlado.

### `safe`

Padrao. Mantem utilidade analitica e reduz risco.

Regras:

- mascarar numeros de conta
- mascarar CNPJ parcial
- opcionalmente transformar nomes de conta em aliases estaveis
- manter categorias e merchants, salvo flag especifica
- nunca incluir segredos de `.env`

### `strict`

Para enviar a terceiros ou LLM externa.

Regras:

- merchants viram aliases estaveis (`merchant_001`)
- contas viram aliases estaveis (`account_002`)
- descricao de transacao pode ser truncada ou hasheada
- IDs internos podem ser removidos
- valores opcionais podem ser bucketizados

---

## Como a IA deve consumir esses dados

O bundle nao deve entregar so agregado. Ele precisa entregar:

- resumo
- evidencias
- proveniencia
- contexto

Exemplo de fluxo ideal:

1. IA le `summary.md`
2. IA usa `analysis-bundle.json` para perguntas amplas
3. IA usa `transactions.jsonl` ou `crypto-assets.jsonl` para aprofundar
4. IA usa `manifest.json` para saber limites e checksums
5. IA usa `prompt-context.md` para manter resposta coerente com o projeto

---

## Funcionalidades avancadas recomendadas

### 1. Snapshot versionado

Cada snapshot deve gerar uma pasta:

```text
.ai/runs/2026-04-15T12-30-00Z/
  analysis-bundle.json
  summary.md
  prompt-context.md
  manifest.json
  entities/
    transactions.jsonl
    categories.jsonl
    merchants.jsonl
```

### 2. Diff semantico

Comparar dois snapshots e responder:

- o que subiu
- o que caiu
- novas recorrencias
- novas anomalias
- variacao de patrimonio
- mudancas em cripto e passivos

### 3. Detector de anomalias

Pode nascer como modulo de heuristica antes de qualquer ML:

- gasto acima de media movel
- merchant novo com ticket alto
- aumento abrupto em categoria
- fatura vencida crescendo
- patrimonio caindo em sequencia
- PnL cripto incompleto

### 4. Modo `--for-llm`

Atalho que gera:

- bundle compacto
- JSON estavel
- sem campos ruidosos
- com `summary.md` e `prompt-context.md`

### 5. Modo `project-context`

Empacotar informacoes tecnicas para agentes de engenharia:

- mapa de modulos
- rotas
- schema
- docs
- scripts

Isso e especialmente util para agentes como Codex, Claude ou Gemini entenderem o sistema antes de atuar.

### 6. Modo MCP no futuro

Nao precisa entrar na V1, mas a CLI pode depois expor:

- `gravel serve --mcp`

Isso transformaria a base de coleta em um servidor MCP para agentes externos.

---

## Fases de implementacao

### Fase 0: fundacao

Entregas:

- scaffolding da CLI
- config
- logger
- parser de comandos
- schemas base
- manifest

### Fase 1: snapshot financeiro

Entregas:

- `doctor`
- `snapshot finance`
- `export transactions`
- `analysis-bundle.json`
- `summary.md`

### Fase 2: diff e prompt-pack

Entregas:

- `diff`
- `prompt-pack`
- `jsonl` por entidade
- redacao `safe` e `strict`

### Fase 3: operacao e contexto tecnico

Entregas:

- `ops`
- `project context`
- digest de docs
- status de providers e sync

### Fase 4: recursos avancados

Entregas:

- detector de anomalias
- chunking para RAG
- modo `--for-llm`
- opcional `serve --mcp`

---

## Testes necessarios

### Unitarios

- parse de filtros
- redacao
- serializacao
- chunking
- diff

### Integracao

- snapshot em banco seedado
- export por entidade
- geracao de manifest
- compatibilidade com `period`, `from`, `to`

### Golden tests

- snapshots de `analysis-bundle.json`
- snapshots de `summary.md`
- snapshots de `prompt-context.md`

### Smoke

```bash
pnpm gravel doctor
pnpm gravel snapshot finance --period mtd --redact safe --out .tmp/ai
pnpm gravel export transactions --period 90d --format jsonl --out .tmp/tx.jsonl
pnpm gravel project context --out .tmp/project
```

---

## Riscos e mitigacoes

### Acoplamento ao schema

Risco:

- a CLI quebrar quando o schema mudar

Mitigacao:

- reutilizar `lib/domain/*`
- manter schemas de saida versionados
- ter golden tests

### Bundle grande demais para IA

Risco:

- explodir token budget

Mitigacao:

- `--top`
- `--limit-transactions`
- `--for-llm`
- `jsonl` por entidade
- `prompt-pack` resumido

### Dados sensiveis vazando

Risco:

- expor PII ou segredos

Mitigacao:

- redacao default `safe`
- exclusao total de `.env`
- validacao de perfis
- manifest com politica aplicada

### Importar modulos da app e puxar runtime desnecessario

Risco:

- a CLI depender de coisas do Next sem querer

Mitigacao:

- adapters proprios em `cli/adapters`
- reutilizar apenas modulos puros de dominio

---

## MVP recomendado

Se eu fosse implementar isso em ordem de valor, comecaria assim:

1. `gravel doctor`
2. `gravel snapshot finance`
3. `gravel export transactions`
4. `gravel prompt-pack`
5. `gravel diff`

Isso ja desbloqueia o principal:

- IA financeira
- IA de auditoria
- analise de evolucao
- contexto pronto para agentes

---

## Decisao final recomendada

Implementar uma CLI chamada `gravel` com foco em snapshots e bundles para IA, baseada em TypeScript, reutilizando diretamente as camadas de dominio e Prisma do projeto.

A CLI deve nascer como ferramenta de exportacao e diagnostico, nao como executor de IA. O papel dela e preparar contexto de altissima qualidade para qualquer modelo externo.

Se a base ficar boa, depois fica simples adicionar:

- `ask`
- `serve --mcp`
- anomalias
- explainers automaticos
- workflows de auditoria

---

## Nome sugerido

Algumas opcoes:

- `gravel`
- `gravel-ai`
- `gravel-intel`
- `gravel-export`

Minha recomendacao:

- comando principal: `gravel`
- namespace de IA: `gravel snapshot`, `gravel prompt-pack`, `gravel diff`, `gravel project context`

Assim a ferramenta cresce sem ficar presa ao nome de um vendor de IA.
