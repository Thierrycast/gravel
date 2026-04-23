# Gravel Finance

Dashboard financeiro pessoal com agregacao de dados bancarios (Pluggy Open Finance) e crypto (Binance). Construido com Next.js 16, React 19, Prisma e SQLite — local-first, sem dependencias de serviços SaaS além dos provedores de dados.

## Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, d3-sankey
- **Backend**: Next.js API Routes, Prisma ORM
- **Banco**: SQLite (arquivo único — ideal para homelab / uso pessoal)
- **Integrações**: Pluggy (Open Finance BR), Binance (Crypto)
- **Testes**: Vitest (unit) + Playwright (E2E smoke)
- **Deploy**: Dockerfile multi-stage (imagem standalone ~470MB)

## Setup

```bash
# Dependências
pnpm install

# Banco local
cp .env.example .env   # preencher variáveis
pnpm db:push

# Dev
pnpm dev
```

## Variáveis de Ambiente

Veja `.env.example`. Resumo:

```env
DATABASE_URL="file:./dev.db"

# Pluggy (Open Finance)
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=

# Binance
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Protege os endpoints em /api/admin/*
INTERNAL_API_KEY=
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Build de produção (standalone) |
| `pnpm start` | Serve o build de produção |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:watch` | Vitest em watch mode |
| `pnpm test:e2e` | Smoke tests do Playwright (sobe `pnpm dev` automaticamente) |
| `pnpm db:push` | Sincroniza o schema com o banco |
| `pnpm db:migrate` | Cria uma migration |
| `pnpm gravel` | CLI do Gravel (`doctor`, `snapshot`, `diff`, `sync`) |

## Documentação

- [Funcionalidades](docs/features.md) — descrição completa de todas as telas e recursos
- [Arquitetura](docs/architecture.md) — camadas, banco de dados e fluxo de dados
- [API Reference](docs/api-reference.md) — todos os endpoints com exemplos
- [Pluggy](docs/pluggy.md) — integração Open Finance
- [Binance](docs/binance.md) — integração crypto
- [CLI](docs/cli.md) — guia completo da linha de comando

## Gravel CLI (IA / Agentes)

CLI nativa para diagnóstico e para empacotar dados financeiros de forma estrita para consumo por LLMs.

```bash
# Diagnóstico de saúde do sistema
pnpm gravel doctor

# Snapshot otimizado para colar num chat com LLM
pnpm gravel snapshot finance --for-llm

# Comparar dois snapshots
pnpm gravel diff ./before ./after
```

Veja o [Guia da CLI](docs/cli.md) para todos os comandos.

## Docker

O Gravel possui Dockerfile multi-stage usando o modo `standalone` do Next.js. A imagem final carrega o Prisma CLI para aplicar o schema no primeiro boot.

### Docker Compose (recomendado)

```bash
docker compose up --build -d
```

O `docker-compose.yml` já cria um volume nomeado (`gravel_data`) para o SQLite, define healthcheck HTTP, e aponta o `DATABASE_URL` para `/app/data/prod.db`.

### Docker puro

```bash
docker build -t gravel .

docker volume create gravel_data

docker run -p 3000:3000 \
  -e DATABASE_URL="file:/app/data/prod.db" \
  -e PLUGGY_CLIENT_ID="..." \
  -e PLUGGY_CLIENT_SECRET="..." \
  -v gravel_data:/app/data \
  gravel
```

> **Dica:** se preferir bind mount (`-v ./data:/app/data`), garanta que o diretório do host pertença ao UID 1001 ou use chmod antes, pois o container roda como usuário não-root.

## Status do build

- `pnpm lint` — ✅ 0 erros, 0 avisos
- `pnpm test` — ✅ 53 testes passando
- `pnpm build` — ✅ standalone gerado
- `docker build` — ✅ imagem ~470 MB

## Funcionalidades Recentes

- **Export CSV na UI**: botão "Exportar" no header de Transações que respeita os filtros ativos.
- **Detalhamento Crypto**: páginas individuais por ativo com gráficos históricos e PnL.
- **Sankey Chart Inteligente**: controle de curvatura, altura e modo privacidade.
- **Snapshot para IA**: CLI otimizada para gerar pacotes de dados para análise por Claude/GPT.
