# Arquitetura

## Stack

- Next.js App Router com React 19.
- API Routes para endpoints internos.
- Prisma + SQLite para persistência local.
- TanStack Query para cache client-side.
- CLI em TypeScript/Commander.
- MCP server em stdio para agentes externos.

## Camadas

- `app/`: páginas e rotas HTTP.
- `components/`: UI e componentes compartilhados.
- `lib/domain/`: regras financeiras, queries e analytics.
- `lib/domain/billing.ts`: motor de ciclo de fatura de cartão (fonte única para `/accounts`, `/bills`, `/projection`, `/settings` e `/reports`).
- `lib/domain/recurring.ts`: regras recorrentes (intervalos, equivalente mensal, CRUD manual, supressão de redetecção).
- `lib/domain/review.ts`: Inbox Financeira e Fechamento do Mês.
- `cli/`: comandos locais.
- `mcp/`: ferramentas MCP.

## Estado operacional

Itens resolvidos/ignorados da Inbox e etapas de fechamento mensal são persistidos em `UserSetting.dashboardConfigJson.reviewState`. Essa escolha evita migração de banco para a primeira versão operacional e mantém o estado acoplado às preferências do usuário local.

## Ciclo de fatura de cartão

Cartões de crédito têm `billingClosingDay` e `billingDueDay` em
`DomainAccount` (configuráveis em `/settings` ou no detalhe do cartão).
O motor em `lib/domain/billing.ts` agrupa transações por período de fatura
(fechamento anterior + 1 dia → dia de fechamento), calcula o vencimento e o
status (`OPEN`, `CLOSED`, `OVERDUE`, `PAID`, `FUTURE`) e reconcilia com as
faturas do provedor (Pluggy):

- fatura do provedor com resíduo < R$ 0,01 em ciclo fechado → `PAID`;
- pagamentos detectados (INFLOW "pagamento recebido/de fatura") são
  deduplificados e atribuídos à fatura de vencimento mais próximo; cobertura
  ≥ 80% → `PAID`;
- faturas com vencimento > 60 dias no passado sem evidência → assumidas pagas.

Cartões sem configuração continuam usando as heurísticas antigas
(`DomainBill` + parcelas detectadas); a UI exibe um aviso pedindo a
configuração. A projeção usa exclusivamente o motor para cartões
configurados, eliminando dupla contagem.

## Recorrências

`DomainRecurringRule` guarda origem em `metadataJson.origin`
(`detected` | `manual` | `dismissed`). Excluir uma regra detectada cria um
marcador `dismissed` inativo cujas chaves de supressão impedem a redetecção.
Totais e projeções usam equivalente mensal (semanal ×52/12, quinzenal ×26/12,
trimestral ÷3, anual ÷12) e a projeção respeita as datas reais de ocorrência
por mês.

## Sincronização Pluggy (refresh, saldo, enriquecimento)

O refresh de dados não é mais só um GET. O fluxo:

- `lib/integrations/pluggy.ts` é o serviço da API principal. `refreshPluggyItem`
  faz `PATCH /items/{id}` (body vazio reusa credenciais) para pedir uma nova
  sincronização na instituição. Erros viram `PluggyApiError` tipado (statusCode,
  code, Retry-After) com retry só em 429/5xx.
- `lib/pluggy-item-refresh.ts` orquestra o refresh de um item: dispara o PATCH,
  acompanha via `GET /items/{id}` até `executionStatus` terminal
  (SUCCESS/PARTIAL_SUCCESS/ERROR) com timeout e polling de 3s, lock por item
  (debounce), e trata MFA/consentimento/reconexão/rate limit. No sucesso relê
  contas/transações/faturas do item e roda o enriquecimento por item.
- O sync manual (`/api/sync/trigger`) e o full sync passam `refresh: true`, então
  o PATCH acontece antes de reler. O webhook continua reprojetando por item.
- Estado do item persiste em `PluggyItem` (executionStatus, syncError,
  lastUpdatedAt, consentExpiresAt, nextAutoSyncAt, lastSyncTriggeredAt,
  lastSyncedAt) e é exposto em `GET /api/pluggy/items` para a UI.

**Saldo em tempo real**: `lib/pluggy-balance.ts` usa `GET /accounts/{id}/balance`
(sem sync completo), mapeia os códigos de erro de balance, persiste
`realtimeBalance`/`realtimeBalanceAt`/`realtimeBalanceStatus` em `DomainAccount`
e faz fallback ao saldo salvo. Rota: `POST /api/domain/accounts/{id}/balance`.

**Enriquecimento** (Enrichment API, serviço separado em
`lib/domain/enrichment/`): `categorize` (categoria/merchant, com validação de
payload e batching de 5000, respeitando categoria manual via `categorySource`),
`recurring-payments` e `behavior-analysis` (`pluggy-item.ts`). Recorrências
persistem em `PluggyRecurringPayment` (direção pelo sinal do valor,
regularityScore, occurrences cruzadas com transações reais, userStatus manual) e
alimentam `/recurring/income`; comportamento em `PluggyBehaviorAnalysis` alimenta
um card no `/insights`.

## Classificação semântica

As regras de `classifyCashFlowTransaction` separam:

- receita real;
- gasto real;
- transferência interna;
- pagamento de fatura;
- investimento;
- excluídos operacionais.

Os KPIs e drill-downs usam a mesma classificação para evitar divergência.
