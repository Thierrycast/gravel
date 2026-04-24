# Relatório de Auditoria — Escopo A (Domínio e Dados)

**Auditor:** Claude (Opus 4.7)
**Branch:** `perf/initial-optimizations`
**Data:** 2026-04-23
**Escopo:** Lógica de negócio, matemática financeira e consistência de estado (Delegação V2)

---

## Status de Remediação

Legenda: ⬜ pendente · 🟨 em andamento · ✅ corrigido · ⛔ não aplicável / adiado

| # | Problema | Status | Observação |
|---|----------|--------|------------|
| 1 | `syncPluggyItem` inexistente | ✅ | Adicionado wrapper em `lib/pluggy-sync.ts` chamando `syncPluggyData({ itemId })` |
| 2 | Off-by-one `rebuildAccountAnchors` (mês corrente) | ✅ | `nowMonth = getUTCMonth() + 1` alinha com `currentMonth` 1-indexado |
| 3 | Idempotência webhook não atômica | ✅ | `create` inicial + catch P2002, com retomada de ERROR e 409 em RUNNING concorrente |
| 4 | Fire-and-forget esconde falhas | ✅ | `syncPluggyItem` aguardado; só marca SUCCESS após terminar; falhas → ERROR + 500 para reentrega |
| 5 | Webhook sem verificação de assinatura | ✅ | `X-Webhook-Secret` comparado em tempo constante contra `PLUGGY_WEBHOOK_SECRET` (se configurado) |
| 6 | Race condition `applyCryptoTransactionDelta` | ✅ | CAS via `updateMany` filtrado por `lastUpdatedAt` + retry (5×); `create` com catch P2002 |
| 7 | Venda a descoberto silenciosa | ✅ | `console.warn` estruturado quando `sell > held` (com ids) |
| 8 | Primeira OUTFLOW cria posição vazia | ✅ | `console.warn` quando primeiro evento do asset é OUTFLOW |
| 9 | Off-by-one boundary `createBalanceAnchor` | ✅ | Janela derivada de `(year, month)` com `gte`/`lte`; cobre `YYYY-MM-01T00:00:00.000Z` |
| 10 | `JSON.parse` sem try/catch | ✅ | `parseCryptoMetadata` com try/catch e validação de shape |
| 11 | `rebuildAccountAnchors` N+1 | ✅ | Um `findMany` + agregação in-memory + `deleteMany`/`createMany` em `$transaction` único (3 queries totais) |
| 12 | `rebuildAllCryptoPositions` transação por trade | ✅ | Estado agregado em `Map` na memória + `$transaction` único com `createMany` lógico |
| 13 | Parse duplo de `metadataJson` no rebuild | ✅ | `parseCryptoMetadata` chamado uma única vez por trade no rebuild |

---

## Bloqueantes (P0 — resolver antes do release)

### 1. `syncPluggyItem` não existe — webhook está quebrado
**Arquivo:** `app/api/webhooks/pluggy/route.ts:3,41`

O handler importa `syncPluggyItem` de `@/lib/pluggy-sync`, mas esse símbolo **não é exportado** em `lib/pluggy-sync.ts`. Os únicos exports são `syncPluggyData` e `getPluggyPersistenceSummary`. Resultado: qualquer POST no endpoint falha — ou no build (type-check) ou em runtime (`undefined is not a function`).

**Ação:** criar `syncPluggyItem(itemId)` em `lib/pluggy-sync.ts` (filtrando `syncPluggyData` por `itemId`) **ou** trocar a chamada para `syncPluggyData({ itemIds: [itemId] })`.

### 2. Off-by-one em `rebuildAccountAnchors` — mês corrente nunca é ancorado
**Arquivo:** `lib/domain/anchors.ts:87-93`

`currentMonth` é 1-indexado (`getUTCMonth() + 1`), mas é comparado contra `now.getUTCMonth()` (0-indexado). O loop sai um mês antes: em abril/2026, o último mês gravado é **março/2026**, não abril.

**Ação:** corrigir condição para `currentMonth <= now.getUTCMonth() + 1`.

### 3. Idempotência do webhook não é atômica — duplica trabalho sob concorrência
**Arquivo:** `app/api/webhooks/pluggy/route.ts:18-70`

O fluxo é `findUnique` → (se novo) disparar sync → `upsert`. Duas requisições simultâneas com o mesmo `id` (Pluggy costuma reenviar) passam no `findUnique`, ambas chamam `syncPluggyItem`, ambas fazem `upsert`. O sync roda em duplicata.

**Ação:** inverter a ordem — tentar `prisma.domainSyncState.create({ stateKey: ... })` primeiro; capturar `P2002` (unique violation) como "já processado" e retornar cedo. Só então disparar o sync.

### 4. Fire-and-forget esconde falhas de sync
**Arquivo:** `app/api/webhooks/pluggy/route.ts:41-43`

`syncPluggyItem(itemId).catch(err => console.error(...))` retorna imediatamente e, logo depois, o evento é **marcado como processado** em `DomainSyncState`. Se o sync falhar, o erro vira apenas um log — o Pluggy reenviará, mas a nova entrada cairá no bloco de idempotência e será descartada. Falhas silenciosas permanentes.

**Ação:** ou (a) aguardar o sync e marcar como processado apenas em sucesso; ou (b) enfileirar propriamente (BullMQ/cron) com status `PENDING`/`SUCCESS`/`FAILED` em `DomainSyncState.status` (o campo já existe no schema).

### 5. Webhook sem verificação de assinatura
**Arquivo:** `app/api/webhooks/pluggy/route.ts` (integralmente)

Não há validação HMAC do header da Pluggy. Qualquer terceiro pode `POST /api/webhooks/pluggy` com um `itemId` válido e disparar syncs arbitrários. Risco de DoS de API e de envenenamento do `DomainSyncState`.

**Ação:** validar o header `X-Signature` (ou equivalente Pluggy) contra o secret antes de qualquer processamento. Rejeitar com 401.

---

## Riscos Matemáticos / Consistência (P1)

### 6. Race condition real em `applyCryptoTransactionDelta`
**Arquivo:** `lib/domain/crypto-delta.ts:19-75`

O `prisma.$transaction` usa `BEGIN DEFERRED` em SQLite. Duas ingestões concorrentes para o mesmo `asset` podem ler o mesmo `position`, calcular novos estados divergentes e uma sobrescrever a outra (lost-update clássico). O WAL permite leitores paralelos; o lock só é adquirido no primeiro write. Em Postgres (sem `SELECT ... FOR UPDATE`) o mesmo vale.

**Ação:** ou (a) trocar o padrão para update atômico com expressões relativas (`quantity: { increment: ... }`) + recomputar `averagePrice` em step separado condicional; ou (b) usar uma fila single-writer por asset; ou (c) adicionar `SELECT ... FOR UPDATE` via `$queryRaw` antes do read. Em SQLite, `BEGIN IMMEDIATE` evita o read gap.

### 7. Venda a descoberto é silenciosamente descartada
**Arquivo:** `lib/domain/crypto-delta.ts:56-60`

`Prisma.Decimal.max(ZERO, newQuantity.minus(quantity))` faz clamp em zero. Se chegar uma `OUTFLOW` maior que a posição (erro de import, trade espelhado errado, venda de asset ainda não sincronizado), o excedente é perdido sem log — **custo basis e quantidade ficam zerados mas a venda real some das métricas**.

**Ação:** emitir um warning ou registrar em uma tabela de anomalias quando `quantity > newQuantity`. Nunca descartar em silêncio.

### 8. Primeira transação sendo OUTFLOW cria posição vazia
**Arquivo:** `lib/domain/crypto-delta.ts:25-34`

Se a primeira transação de um asset for uma venda (ordem de eventos fora de ordem, import parcial), `position` é criada com `quantity=0/costBasis=0`, o OUTFLOW é clampado, e a posição permanece zerada — mas **o registro existe**, mascarando a ausência de histórico de compra.

**Ação:** mesma correção do item 7 — sinalizar inconsistência em vez de persistir estado vazio.

### 9. Off-by-one em `createBalanceAnchor` (boundary entre meses)
**Arquivo:** `lib/domain/anchors.ts:26-45`

`startDate = Date.UTC(prev.year, prev.month, 1)` com `prev.month` já em 1-indexado → acaba apontando para o 1º dia do mês **seguinte** ao correto (em 0-indexado do JS). Combinado com `occurredAt > startDate` (estrito), uma transação carimbada em `YYYY-04-01T00:00:00.000Z` **não entra em março (já passou do `endDate`) nem em abril (não é `>` do `startDate`)**. Perdida.

**Ação:** derivar `startDate` do parâmetro `month` em vez do anchor anterior: `startDate = new Date(Date.UTC(year, month - 1, 1))` e usar `gte` (ou manter `gt` com `startDate = prev.endDate`).

### 10. `metadataJson` malformado derruba o delta
**Arquivo:** `lib/domain/crypto-delta.ts:14`

`JSON.parse(transaction.metadataJson)` sem try/catch. Um registro com JSON corrompido (truncamento de import antigo) faz o delta jogar exceção e, se vier de um caminho sem tratamento upstream, derruba o sync inteiro.

**Ação:** `try/catch` ao redor do parse, logando e pulando o registro (com registro de anomalia).

---

## Performance / Escalabilidade (P2)

### 11. `rebuildAccountAnchors` é O(n) sequencial com query N+1
**Arquivo:** `lib/domain/anchors.ts:78-102`

Para 5 anos = 60 meses, por mês são feitas: `findFirst` (previous anchor) + `aggregate` + `upsert` = 3 round-trips × 60 = **~180 queries sequenciais por conta**. Com múltiplas contas, escala linear ruim.

**Ação:** substituir por **um único** `groupBy` no `DomainTransaction` agrupado por `(ano, mês)` via SQL nativo (`strftime('%Y-%m', occurredAt)`), computar os deltas em memória como soma cumulativa, e fazer um `createMany`/`upsert` em batch. De ~180 queries para ~3.

### 12. `rebuildAllCryptoPositions` abre uma transação por trade
**Arquivo:** `lib/domain/crypto-delta.ts:95-101`

Cada chamada a `applyCryptoTransactionDelta` abre um novo `$transaction`. Para milhares de trades, são milhares de BEGIN/COMMIT — overhead alto, principalmente em SQLite.

**Ação:** para o caminho de *rebuild*, envelopar o loop inteiro em uma única `$transaction` ou construir o estado em memória (Map de positions) e fazer um `createMany` final. O caminho incremental (delta único) pode continuar como está.

### 13. Re-parsing duplo de `metadataJson` no rebuild
**Arquivo:** `lib/domain/crypto-delta.ts:97-100`

`rebuildAllCryptoPositions` faz `JSON.parse` para filtrar por `asset`, depois chama `applyCryptoTransactionDelta` que faz `JSON.parse` de novo. Pequeno, mas 2× o custo em rebuild.

**Ação:** já que está iterando, passar o `asset`/`price` como argumento para uma variante interna de `applyCryptoTransactionDelta` que evite o segundo parse.

---

## Observações (P3)

- **`rebuildAccountAnchors` sem janela seletiva**: toda correção retroativa exige recomputar desde o primeiro `occurredAt`. Considerar assinatura `rebuildAccountAnchors(accountId, fromYear?, fromMonth?)` para rebuild incremental a partir de um mês afetado.
- **Transações futuras**: `rebuildAccountAnchors` para em `now` — se o usuário agenda uma transação para daqui a 2 meses, ela só será ancorada quando o mês passar. Ok como intenção, mas documentar.
- **`transactionsCount` usa `_count` escalar**: em Prisma aggregate, `_count: true` conta linhas; ok, mas se um dia houver filtro por `amount != null`, revisar.
- **`console.log` no webhook** expõe `itemId` em logs estruturados de produção. Considerar redação.
- **Contrato implícito com `metadataJson`**: `crypto-delta` depende de `baseAsset || asset` e `price` sem schema formal. Uma mudança silenciosa no `projectors.ts` (hoje grava `{ providerCode, providerId, status, type }`) já romperia: **na prática, o `metadataJson` atual do Pluggy não traz `baseAsset` nem `price`**, então `applyCryptoTransactionDelta` é efetivamente no-op para transações vindas do Pluggy. Vale checar de onde vêm os trades esperados (importer de corretora específica?) e formalizar o shape via Zod.

---

## Resumo executivo

- **3 bugs bloqueantes** (webhook não compila, mês corrente perdido nos anchors, idempotência falsa sob concorrência).
- **1 gap de segurança crítico** (sem validação de assinatura no webhook).
- **2 erros matemáticos sutis** (off-by-one no boundary de meses; race condition no custo médio).
- **Descartes silenciosos** em múltiplos pontos — o padrão "clamp em zero e seguir" está enterrando inconsistências de dados.
- Performance do rebuild de anchors pode ser reduzida de ~180 para ~3 queries com `groupBy`.

A prioridade, conforme a regra 3 do guia (segurança de dados > performance), é **1–5 → 6–10 → 11–13**.

---

## Arquivos analisados

- `lib/domain/crypto-delta.ts`
- `lib/domain/anchors.ts`
- `app/api/webhooks/pluggy/route.ts`
- `prisma/schema.prisma` (modelos `DomainTransaction`, `DomainCryptoPosition`, `DomainBalanceAnchor`, `DomainSyncState`)
- `lib/prisma.ts` (config WAL/synchronous)
- `lib/domain/projectors.ts` (convenção de sinal do `amount`)
- `lib/pluggy-sync.ts` (verificação de exports)
