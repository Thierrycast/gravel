# Gravel Finance

Dashboard financeiro pessoal com agregacao de dados bancarios (Pluggy Open Finance) e crypto (Binance). Construido com Next.js, Prisma e SQLite.

## Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, d3-sankey
- **Backend**: Next.js App Router (API Routes), Prisma ORM
- **Banco**: SQLite (local)
- **Integracoes**: Pluggy (Open Finance), Binance (Crypto)

## Setup

```bash
# Dependencias
pnpm install

# Banco
cp .env.example .env   # configurar variaveis
pnpm db:push

# Dev
pnpm dev
```

## Variaveis de Ambiente

```env
DATABASE_URL="file:./dev.db"

# Pluggy
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=

# Binance
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Admin
INTERNAL_API_KEY=
```

## Documentacao

- [Funcionalidades](docs/features.md) - descricao completa de todas as funcionalidades
- [Arquitetura](docs/architecture.md) - camadas, banco de dados e fluxo de dados
- [API Reference](docs/api-reference.md) - todos os endpoints com exemplos
- [Pluggy](docs/pluggy.md) - integracao Open Finance
- [Binance](docs/binance.md) - integracao crypto
- [CLI Reference](docs/cli.md) - guia completo de uso da linha de comando

## Gravel CLI (IA / Agentes)

O projeto possui uma CLI nativa desenhada para diagnóstico e para empacotar dados financeiros de forma estrita para consumo por Large Language Models (LLMs).

```bash
# Diagnóstico de saúde do sistema
npm run gravel -- doctor

# Snapshot otimizado para colar no chat de LLMs
npm run gravel -- snapshot finance --for-llm
```

Veja o [Guia da CLI](docs/cli.md) para todos os comandos.

## Scripts

| Comando | Descricao |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de producao |
| `pnpm start` | Servir build de producao |
| `pnpm db:push` | Sincronizar schema com banco |
| `pnpm db:migrate` | Criar migration |
| `pnpm lint` | Rodar ESLint |
