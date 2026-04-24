# Relatório Codex: Auditoria de Performance e Infra V2

Data: 2026-04-23
Escopo: SQL indexes, serialização de domínio, lazy loading da UI e integração BCB
Autor: Codex

## Contexto

Esta auditoria cobre o Escopo B da V2 do Gravel, com foco em otimização de sistema e sem alteração de lógica de negócio.

Arquivos revisados:

- `prisma/schema.prisma`
- `lib/prisma.ts`
- `lib/core/serialization.ts`
- `app/page.tsx`
- `app/overview-dashboard.tsx`
- `components/dashboard/skeleton-chart.tsx`
- `components/dashboard/recent-transactions.tsx`
- `lib/domain/analytics.ts`
- `lib/domain/queries.ts`
- `lib/integrations/bcb.ts`

Também foram usados:

- `docs/performance-optimization.md`
- `prisma/dev.db` com `EXPLAIN QUERY PLAN`
- documentação oficial do BCB

## Achados

### 1. Índices de `DomainTransaction` ainda não cobrem as queries mais quentes

Status: `parcialmente resolvido`

Em `prisma/schema.prisma`, os índices compostos de `DomainTransaction` terminam em `amount`, mas as queries críticas do dashboard também filtram por `ignored` e em alguns casos dependem de `domainCategoryId` e `createdAt`.

Referências:

- `prisma/schema.prisma`
- `lib/domain/analytics.ts`
- `lib/domain/queries.ts`

Evidência prática no `prisma/dev.db`:

- antes, `EXPLAIN QUERY PLAN` mostrava apenas `USING INDEX`
- após ajuste do schema e `db push`, a agregação principal passou a usar `USING COVERING INDEX`
- o `groupBy(domainCategoryId)` ainda usa `USE TEMP B-TREE FOR GROUP BY`

Impacto:

- continua havendo table lookup nas agregações mais quentes
- o plano de execução ainda depende de estrutura temporária para agrupamento
- a meta de caminho realmente “instant-first” não foi totalmente alcançada

O que foi feito:

- o schema foi ajustado para refletir melhor os filtros reais de `direction`, `ignored`, `occurredAt`, `createdAt` e `domainCategoryId`
- os novos índices foram aplicados no banco local com `pnpm prisma db push`
- a query de agregação principal passou a usar `COVERING INDEX`

O que ainda não foi totalmente resolvido:

- o agrupamento por categoria ainda gera estrutura temporária no SQLite
- a query paginada com `ORDER BY occurredAt, createdAt` ainda não está completamente otimizada

### 2. Configuração WAL está incompleta para contenção de escrita

Status: `resolvido`

Em `lib/prisma.ts`, `PRAGMA journal_mode = WAL` e `PRAGMA synchronous = NORMAL` são disparados sem `await`, e não há configuração de `busy_timeout`.

Evidência prática validada:

- o bootstrap agora aguarda a configuração antes das queries
- `PRAGMA busy_timeout` foi validado via Prisma client com valor `5000`

O que foi feito:

- `journal_mode`, `synchronous` e `busy_timeout` passaram a ser configurados com fluxo consistente de bootstrap
- as queries do Prisma agora aguardam a inicialização do client antes de executar
- foi adicionada a configuração de `busy_timeout = 5000`

### 3. Lazy loading do gráfico existe, mas o payload do dashboard continua pesado

Status: `parcialmente resolvido`

O que foi feito:

- o dashboard parou de carregar `bills` no payload inicial
- o payload inicial passou a enviar apenas os campos realmente usados pela tela
- o mapeamento de transações para a UI foi movido para o servidor

O uso de `next/dynamic` em `app/overview-dashboard.tsx` de fato posterga o carregamento do gráfico e ajuda a isolar o bundle do Recharts.

O fluxo principal ainda continua passando por um componente client amplo:

- `app/page.tsx` busca tudo em paralelo
- `app/page.tsx` serializa tudo para `initialData`
- `app/overview-dashboard.tsx` é `use client`
- `bills` é carregado e serializado, mas não é usado no dashboard

Impacto:

- o ganho de bundle não reduz o custo de hidratação do restante da tela
- o caminho server -> client ainda trafega dados além do necessário
- parte do benefício do lazy loading é anulada por excesso de payload inicial

### 4. A serialização ainda não fecha um contrato explícito de DTO

Status: `resolvido`

O que foi feito:

- `serializeDomain` agora converte `Date` para ISO string
- a serialização continua convertendo `Prisma.Decimal` para `number`
- foi adicionada proteção contra referência circular com erro explícito
- o contrato de DTO ficou estável para a fronteira server -> client

Em `lib/core/serialization.ts`, o helper converte `Prisma.Decimal` para `number`, mas preserva `Date` como objeto cru e não protege contra ciclos.

Problemas observados:

- o client assume strings de data em pontos como `lib/types/api.ts` e `components/dashboard/recent-transactions.tsx`
- o helper depende do comportamento implícito da fronteira RSC para datas
- não há proteção contra referência circular

Impacto:

- o contrato de serialização fica implícito e frágil
- o helper não é seguro como serializador genérico de domínio
- reaproveitamento fora da fronteira RSC pode quebrar shape e compatibilidade

### 5. Integração BCB pode falhar por ausência de filtros de período

Status: `resolvido`

O que foi feito:

- a sincronização passou a usar janelas compatíveis com o limite de 10 anos
- as datas agora são enviadas com `dataInicial` e `dataFinal`
- o parsing de `dd/MM/yyyy` ganhou validação estrita
- o upsert passou a rodar em lotes transacionais

Em `lib/integrations/bcb.ts`, a URL usa sempre `.../dados?formato=json`, sem `dataInicial` e `dataFinal`.

Segundo a documentação oficial do BCB, desde **26 de março de 2025**, consultas JSON e CSV de séries históricas diárias passaram a exigir filtros e foram limitadas a janela de 10 anos.

Também há um problema de robustez no parsing:

- o código assume `dd/MM/yyyy`
- qualquer string com duas barras é aceita sem validação real

Resultado:

- a integração deixa de depender de uma consulta única fora da janela aceita pelo BCB
- o parsing de datas ficou estrito e previsível
- o persist passa a ocorrer em lotes transacionais em vez de upserts isolados

Observação:

- não encontrei, nas fontes oficiais consultadas, rate limit público por segundo ou minuto para esse endpoint específico
- o limite documentado encontrado é de volume e janela de dados por consulta

## Evidências e Referências

Código:

- [prisma/schema.prisma](/home/thierry/personal/projects/gravel/prisma/schema.prisma)
- [lib/prisma.ts](/home/thierry/personal/projects/gravel/lib/prisma.ts)
- [lib/core/serialization.ts](/home/thierry/personal/projects/gravel/lib/core/serialization.ts)
- [app/page.tsx](/home/thierry/personal/projects/gravel/app/page.tsx)
- [app/overview-dashboard.tsx](/home/thierry/personal/projects/gravel/app/overview-dashboard.tsx)
- [components/dashboard/skeleton-chart.tsx](/home/thierry/personal/projects/gravel/components/dashboard/skeleton-chart.tsx)
- [components/dashboard/recent-transactions.tsx](/home/thierry/personal/projects/gravel/components/dashboard/recent-transactions.tsx)
- [lib/domain/analytics.ts](/home/thierry/personal/projects/gravel/lib/domain/analytics.ts)
- [lib/domain/queries.ts](/home/thierry/personal/projects/gravel/lib/domain/queries.ts)
- [lib/integrations/bcb.ts](/home/thierry/personal/projects/gravel/lib/integrations/bcb.ts)

Banco:

- `prisma/dev.db`
- `EXPLAIN QUERY PLAN`
- `PRAGMA journal_mode`
- `PRAGMA synchronous`
- `PRAGMA busy_timeout`

Fontes externas:

- https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom
- https://dadosabertos.bcb.gov.br/dataset

## Plano curto

- Motivo: registrar formalmente o relatório da auditoria do Codex em arquivo versionável
- Impacto: nenhum impacto funcional, apenas documentação
- Como testar: abrir o arquivo Markdown e validar conteúdo e links

## Validação executada

- `pnpm prisma db push` — OK
- `pnpm eslint app/page.tsx app/overview-dashboard.tsx lib/core/serialization.ts lib/prisma.ts lib/integrations/bcb.ts` — OK
- `pnpm test` — OK, 53 testes passando
