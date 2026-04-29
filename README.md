# Gravel Finance

✨ Um dashboard financeiro pessoal com agregação de dados bancários (Pluggy Open Finance) e crypto (Binance).

Construído com **Next.js 16**, **React 19**, **Prisma** e **SQLite** — uma arquitetura *local-first*, sem dependências de serviços SaaS externos além dos provedores de dados. Ideal para homelab e uso pessoal com controle total sobre sua privacidade financeira.

---

## 🚀 Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts, d3-sankey
- **Backend**: Next.js API Routes, Prisma ORM
- **Banco de Dados**: SQLite (arquivo único, zero dor de cabeça)
- **Integrações**: Pluggy (Open Finance BR), Binance (Crypto)
- **Testes**: Vitest (Unit)
- **Deploy**: Dockerfile multi-stage (imagem autossuficiente ~470MB)

---

## 🛠️ Setup Rápido

1. **Instale as dependências:**
   ```bash
   pnpm install
   ```

2. **Configure o banco local:**
   ```bash
   cp .env.example .env   # preencha as variáveis necessárias
   pnpm db:push
   ```

3. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm dev
   ```

---

## ⚙️ Variáveis de Ambiente

Consulte o arquivo `.env.example`. Um resumo das principais configurações:

```env
DATABASE_URL="file:./dev.db"

# Pluggy (Open Finance)
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=

# Binance
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Protege os endpoints internos em /api/admin/*
INTERNAL_API_KEY=
```

---

## 📜 Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento. |
| `pnpm build` | Build de produção (modo standalone). |
| `pnpm start` | Inicia o build de produção. |
| `pnpm lint` | Executa o ESLint. |
| `pnpm test` | Testes unitários (Vitest). |
| `pnpm test:watch` | Testes em modo watch. |
| `pnpm db:push` | Sincroniza o schema do Prisma com o SQLite. |
| `pnpm db:migrate` | Gera uma migration do banco de dados. |
| `pnpm gravel` | Ferramenta de CLI local (`doctor`, `snapshot`, `diff`, `sync`). |

---

## 📚 Documentação

- 🌟 [Funcionalidades](docs/features.md) — Visão detalhada de todas as telas e recursos.
- 🏗️ [Arquitetura](docs/architecture.md) — Camadas, esquema de dados e fluxo da aplicação.
- 📖 [API Reference](docs/api-reference.md) — Endpoints e exemplos de requisição.
- 🔌 [Integração Pluggy](docs/pluggy.md) — Detalhes do Open Finance.
- 🪙 [Integração Binance](docs/binance.md) — Detalhes da sincronização de criptomoedas.
- 🖥️ [CLI](docs/cli.md) — Guia da linha de comando do Gravel.

---

## 🤖 Gravel CLI (Integração de IA)

Uma CLI nativa desenvolvida para diagnóstico e empacotamento de dados financeiros para consumo rápido e estrito por LLMs (ChatGPT/Claude).

```bash
# Diagnóstico de saúde do sistema
pnpm gravel doctor

# Snapshot otimizado para colar num chat com LLM
pnpm gravel snapshot finance --for-llm

# Comparar dois snapshots
pnpm gravel diff ./before ./after
```

Para mais comandos, consulte o [Guia da CLI](docs/cli.md).

---

## 🐳 Docker (Deploy Homelab)

O projeto utiliza um Dockerfile multi-stage baseado no modo `standalone` do Next.js. O Prisma CLI é embarcado na imagem para aplicar schemas no primeiro boot.

### Docker Compose (Recomendado)

A maneira mais rápida de rodar a aplicação em produção:

```bash
docker compose up --build -d
```

O `docker-compose.yml` criará um volume nomeado (`gravel_data`) para proteger o arquivo SQLite, definirá healthchecks HTTP e setará o banco em `/app/data/prod.db`.

### Docker Puro

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

> **Dica de Permissões:** Caso opte por um bind mount local (`-v ./data:/app/data`), certifique-se de que o diretório pertence ao usuário de ID `1001` (aplicando um `chmod`), uma vez que o container roda usando um usuário não-root por segurança.

---

## 📈 Status do Build

- `pnpm lint` — ✅ 0 erros, 0 avisos
- `pnpm test` — ✅ Testes rodando 100% OK
- `pnpm build` — ✅ Artefato standalone com sucesso
- `docker build` — ✅ Imagem otimizada (~470 MB)

---

## ✨ Destaques Recentes

- 📊 **Exportação de CSV Direta na UI**: Botão no cabeçalho das Transações respeitando todos os filtros ativos.
- 📈 **Detalhamento Cripto Profundo**: Gráficos históricos, visão de PnL por ativo e custo médio móvel real.
- 🌊 **Sankey Chart Inteligente**: Visualização moderna do fluxo do seu dinheiro, com modo privacidade e curvatura controlada.
- 🧠 **Snapshot de IA**: Pipeline otimizada para "alimentar" sua IA com as métricas essenciais e gerar insights poderosos sobre seu dinheiro.
