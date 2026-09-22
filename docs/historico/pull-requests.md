# Pull requests do repositório (arquivo histórico)

Exportado em 2026-09-22, antes de recriar o repositório no GitHub para
eliminar objetos órfãos com dado pessoal. O CÓDIGO destes PRs está todo na
main — o que se perderia era a conversa, e é ela que está preservada aqui.

## PR #3 — Feat/system evolution

- Autor: Thierrycast
- Branch: `feat/system-evolution` → `main`
- Criado: 2026-06-12T01:59:42Z
- Mergeado: 2026-06-12T02:13:42Z
- Commits: 22 | +5213 −467 em 111 arquivos

## Descrição
Este PR reúne as atualizações recentes voltadas para automação financeira, proteção e usabilidade.

## Principais Implementações

### 🚀 Funcionalidades Recentes
- **Cenários & Metas**: Criação de objetivos financeiros e simulações "what-if".
- **Inbox & Revisão**: Fluxo inédito para análise de transações e encerramento mensal.
- **Analytics**: Identificação automática de renda, estudo de padrões de gastos e novos gráficos inline.
- **Integrações**: Servidor MCP para integração com LLMs e handler de webhooks Pluggy (idempotente).
- **PWA**: Capacidade offline e service worker incorporado via Serwist.

### 🛡️ Proteção & Infraestrutura
- **Vault API**: Novo provedor de segredos e API para administração.
- **Criptografia**: Atualização do KDF para `scrypt` mantendo compatibilidade retroativa.
- **Database**: Modelos `AppSecret` e `SystemMetadata` no Prisma.

### 🛠️ Ferramentas de Desenvolvimento & CLI
- **CLI**: Comando `review` e coletores de anomalias implementados.
- **DX**: Utilitário de busca de código JSX para ambientes Remote-SSH.

### ⚡ Performance & Correções
- **UX**: Skeletons de carregamento em todas as páginas.
- **Build**: Ajustes no processo de build standalone e correções de lógica no domínio.

### Comentários

---

## PR #2 — feat: comprehensive UX and bug audit fixes

- Autor: Thierrycast
- Branch: `feat/gravel-audit-fixes` → `main`
- Criado: 2026-05-29T13:05:22Z
- Mergeado: 2026-05-29T14:04:21Z
- Commits: 29 | +14239 −13186 em 187 arquivos

### 💎 Comprehensive UX and Bug Audit Fixes

This Pull Request addresses 100% of the requirements from the 2026-05-27 Audit Report, focusing on financial precision, mobile responsiveness, and structural integrity.

#### 🚀 Key Improvements

- **Financial Precision & Multi-Currency**: Implemented a robust real-time conversion engine (USD -> BRL) using shared exchange rates across all dashboards and reports.
- **Mobile-First UX**: Overhauled navigation with a native-feel Bottom Nav, safe-area support, and smooth view transitions. Added full PWA support (Manifest & Service Worker).
- **Dashboard Overhaul**: Redesigned the Overview dashboard with comparative analytics, improved chart scaling (Y-axis padding), and optimized rendering logic to prevent crashes.
- **Forensic & Smart Logic**: Enhanced installment detection, forensic anomaly tracking, and automated merchant/logo enrichment.
- **Code Health**: 
  - 161/161 Vitest tests passing.
  - 100% clean Lint report (0 errors, 0 warnings).
  - Successful production build (Turbopack).
  - Cleanup of over 7k lines of legacy documentation and unused assets.

#### 📝 Implementation Details (26 Commits)

1. **Config & Build**: Updated Docker, Next.js, and Linting configurations.
2. **Data Layer**: Updated Prisma schema and client for better financial tracking.
3. **Core Domain**: Refactored domain types, constants, and currency logic for multi-currency support.
4. **Synchronization**: Enhanced Pluggy integration and automated bank sync processes.
5. **UI/UX**: Modernized the design system, layout, and navigation for mobile excellence.
6. **Analytics**: Rebuilt the metrics API and redesigned core reporting pages.
7. **Cleanup**: Removed legacy documentation and deprecated agent skills.

This PR elevates Gravel Finance to a production-ready, polished state.

### Comentários

---

## PR #1 — Perf/initial optimizations

- Autor: Thierrycast
- Branch: `perf/initial-optimizations` → `main`
- Criado: 2026-04-29T00:52:45Z
- Mergeado: 2026-04-29T05:16:44Z
- Commits: 54 | +14098 −6988 em 159 arquivos

## Description

This Pull Request introduces a massive suite of performance optimizations, infrastructure improvements, and new features to the Gravel ecosystem. Originally focused on performance (`perf/initial-optimizations`), the branch evolved to deliver deep architectural enhancements, code refactoring, and advanced financial analytics tools.

## Key Changes

### Performance & Infrastructure
- **SQLite WAL Mode & Index Optimization**: Enabled Write-Ahead Logging mode in SQLite and tuned indexes to optimize Prisma query plans.
- **Server Components (RSC)**: Migrated the Dashboard to React Server Components with direct data access, drastically reducing initial payloads.
- **Lazy Loading & Serialization**: Implemented lazy loading for heavy charts and optimized domain layer serialization.
- **CI/CD**: Added a GitHub Actions workflow for automated testing and validation.

### Domain & Backend
- **Native SQL Aggregations**: Migrated complex calculations (inflow/outflow and category rankings) from Node.js memory to native database queries.
- **Materialized States**: Implemented materialized states for cryptocurrency PnL and account balance anchors, avoiding excessive recalculations on render.
- **Advanced Enrichment**: Comprehensive identification of institutions and merchants, local proxy support for logo caching, and native internal-transfer marking.
- **Sync Automation**: Implemented the Pluggy Webhook handler and a server-side auto-sync mechanism to keep data continuously updated.
- **Installment Tracking**: Intelligent detection and tracking of split purchases through `InstallmentGroups`.

### Frontend & UX
- **Roadmap Completion**: Fully implemented core roadmap features including Premium Themes, Security Vault, Scenario Engine, and AI Insights (Benford's Law, behavioral nudges).
- **Upgraded Charts and Analytics**: Added a new Cash-Flow chart to the dashboard, performed a massive upgrade to the crypto asset chart (with trade markers and multi-mode analytics), and improved typography.
- **Native Interactions**: Quick toggle button to add/remove funds from physical CASH wallets and a PATCH endpoint for manual bill payments.
- **Logo.dev Proxy**: Integrated the `LogoImage` component with a local proxy for the elegant rendering of merchant and bank logos across transactions.

### Cleanup & Documentation
- **Artifact Cleanup**: Completely removed the Playwright E2E suite (focusing on Vitest), temporary scripts, and development leftovers.
- **Refactoring**: Standardized formatting and improved type/null safety across the `lib/domain/` layer.
- **Premium Documentation**: Substantial overhaul of all project documentation (`docs/*.md`), ensuring textual cohesion, mapping of new routes/models, and delivering a professional, presentation-ready `README.md`.

---
*Note: This PR consolidates the recent ~50 commits covering optimizations, UI enhancements, and structural cleanup.*


### Comentários

---

