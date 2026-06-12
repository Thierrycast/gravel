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
- `lib/domain/review.ts`: Inbox Financeira e Fechamento do Mês.
- `cli/`: comandos locais.
- `mcp/`: ferramentas MCP.

## Estado operacional

Itens resolvidos/ignorados da Inbox e etapas de fechamento mensal são persistidos em `UserSetting.dashboardConfigJson.reviewState`. Essa escolha evita migração de banco para a primeira versão operacional e mantém o estado acoplado às preferências do usuário local.

## Classificação semântica

As regras de `classifyCashFlowTransaction` separam:

- receita real;
- gasto real;
- transferência interna;
- pagamento de fatura;
- investimento;
- excluídos operacionais.

Os KPIs e drill-downs usam a mesma classificação para evitar divergência.
