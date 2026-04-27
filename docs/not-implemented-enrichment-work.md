# Trabalho Nao Implementado

Este documento registra os pontos do mega-prompt original que nao foram implementados ou ficaram em versao pragmatica.

## Mapa de Merchants

- Nao foi implementado mapa de vendedores/merchants.
- Motivo: os dados atuais expostos pela aplicacao nao trazem latitude/longitude ou localizacao real suficiente.
- Decisao: nao criar feature fake nem adicionar dependencia pesada sem dado confiavel.

## Pluggy Enrichment Avancado

- Ainda nao sao enviados `paymentData`, CPF/CNPJ de pagador/recebedor, `creditCardMetadata.payeeMCC` ou `isBusiness` real para a Pluggy.
- Motivo: esses campos nao estavam claramente persistidos no raw model atual.
- O enrichment atual usa `id`, `amount`, `date`, `description` e `accountType`.

## Jobs, Fila e Scheduler

- Nao foi criado sistema robusto de fila/scheduler.
- O que existe: endpoints admin para execucao manual/on-demand e backfill em lotes.
- Pendente: retry/backoff configuravel, metricas historicas por job, tabela de job items e agendamento automatico.

## Overrides Completos de Usuario

- Existem regras locais e campos effective/display, mas nao foi entregue uma UX completa para:
  - recategorizar transacao manualmente;
  - renomear merchant manualmente;
  - marcar transferencia interna pela UI;
  - ocultar de analytics por acao direta em todas as telas.

## Persistencia Completa Raw / Enriched / Effective

- A separacao raw/enriched/effective foi melhorada, mas nao virou o DTO completo `EnrichedTransaction` descrito no mega-prompt.
- Nao foram criadas todas as tabelas sugeridas, como `enrichment_jobs`, `enrichment_job_items`, `transaction_user_overrides` e `transaction_override_rules`.
- O projeto manteve a arquitetura existente com `DomainTransaction`, `TransactionEnrichment`, `MerchantEnrichment`, regras locais e campos de display.

## Migracoes Formais

- Nao foram criadas migrations Prisma formais.
- Foi usado `pnpm db:push`, conforme decisao do plano final e padrao atual do projeto.
- Pendente se o projeto passar a exigir historico versionado de schema.

## Logo.dev Completo

- Logo.dev foi implementado para cache/logo/Describe backend.
- Nao foi criado um resolvedor universal de dominio para qualquer merchant.
- A resolucao atual combina overrides, dominios conhecidos e fallback visual.

## Testes Ainda Desejaveis

- Teste unitario para `runPluggyTransactionEnrichment` cobrindo cache de `SUCCESS`, `UNMATCHED` e `ERROR`.
- Teste unitario para agrupamento por `accountType`.
- Teste de reprojecao apos enrichment Pluggy.
- Teste de seguranca dos endpoints admin.
- Teste de UI especifico para troca de tema persistida apos refresh.
- Teste E2E cobrindo logos/enrichment na tela de transacoes.

## Warnings Mantidos

- `pnpm lint` ainda reporta 6 warnings de uso de `<img>`:
  - `app/recurring/page.tsx`
  - `app/transactions/page.tsx`
  - `components/dashboard/recent-transactions.tsx`
  - `components/dashboard/upcoming-expenses.tsx`

Nao sao erros de build, mas podem ser tratados depois trocando para `next/image` ou criando um componente padrao de logo.
