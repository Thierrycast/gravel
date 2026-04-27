# Trabalho Implementado

Este documento resume o que foi entregue no fechamento da revisão financeira, enrichment e UI.

## Commit

- `8de40cd feat: add enrichment and normalize financial totals`

## Enrichment

- Criada camada de enrichment em `lib/domain/enrichment/*`.
- Adicionado cache de merchant/logo em `MerchantEnrichment`.
- Adicionado cache de enriquecimento transacional Pluggy em `TransactionEnrichment`.
- Logo.dev usa `LOGO_DEV_SECRET_KEY` apenas no backend para Describe.
- URLs de logo usam CDN com `LOGO_DEV_PUBLISHABLE_KEY`.
- Pluggy enrichment roda por endpoints admin protegidos.
- Pluggy enrichment processa lotes por tipo de conta (`CHECKING`, `CREDIT_CARD` ou desconhecido).
- Resultados `SUCCESS` e `UNMATCHED` recentes nao sao reenviados agressivamente.
- Erros recentes tambem respeitam janela curta de retry.
- Quando ha enriquecimento Pluggy novo, os read models Pluggy sao reprojetados.
- UI de transacoes usa `displayTitle`, `displaySubtitle`, merchant logo, status de enrichment e fallback visual.
- Recorrencias usam `MerchantEnrichment` como fonte preferencial de logo, com helper direto apenas como fallback.

## Parcelamento

- Criada camada central de parcelamento em `lib/domain/installments.ts`.
- Adicionados campos de parcela em `DomainTransaction`.
- Criado modelo `TransactionInstallmentGroup`.
- Criado endpoint admin para rebuild de parcelamentos.
- Projecao Pluggy passou a detectar parcelas explicitas (`N/T` ou `N de T`).
- Rebuild de parcelamentos foi integrado ao fluxo de projecao Pluggy.
- Heuristica por similaridade ficou conservadora para evitar confundir assinaturas longas com compras parceladas.
- Recorrencias excluem regras marcadas como parcela da lista de despesas fixas.
- Projecao evita somar parcelas detectadas quando ja existe fatura do mesmo cartao no mes.

## Moedas e Agregados

- Criado helper de moeda em `lib/domain/currency.ts`.
- Criado formatter por codigo de moeda em `lib/format.ts`.
- Dashboard deixou de somar cripto/USD bruto como BRL.
- Investimentos sao agrupados e exibidos por moeda original.
- API de investimentos retorna resumo por moeda.
- Portfolio filtra agregados fiat para BRL e trata passivos de cartao de forma explicita.
- Cripto segue convertido para BRL quando entra em agregados consolidados.

## UI e Tema

- Tema com `next-themes` foi estabilizado com familias `default`, `cyberpunk` e `emerald`.
- Adicionado `ThemePicker` em Configuracoes.
- `ModeToggle` preserva familia de tema ao alternar claro/escuro.
- Badges foram refinados com padding, alinhamento e arredondamento sutil.
- Pagina individual de cripto exibe logo do ativo com fallback visual.
- Tabelas/listagens principais foram ajustadas para consumir campos de display enriquecidos.

## Higiene e Validacao

- `.kilo/`, scratchpads e scripts locais soltos foram ignorados.
- Vitest nao coleta mais `.kilo/node_modules`.
- Prisma schema foi aplicado com `pnpm db:push`.
- Prisma Client foi regenerado.

Checks executados:

- `git diff --check`
- `pnpm exec prisma validate`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `pnpm test:e2e`

Resultado final:

- Unit tests: 82 passando.
- Playwright smoke: 4 passando.
- Build: passou.
- Lint: 0 erros, 6 warnings conhecidos de `<img>`.
