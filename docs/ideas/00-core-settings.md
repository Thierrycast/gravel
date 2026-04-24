# Ideia Base: Configurações Fundamentais

Este documento define a base para a página `/settings`, focando no que é essencial para o funcionamento do sistema fora do ambiente de desenvolvimento.

## 1. Integrações (Data Providers)
- **Interface para Credentials:** Campos para `CLIENT_ID`, `CLIENT_SECRET` (Pluggy) e `API_KEY`, `API_SECRET` (Binance).
- **Ordem de Precedência:** O sistema deve buscar primeiro no banco de dados (configurações da UI), depois no `.env`, e por fim usar valores default.

## 2. Sync Engine (Sincronização)
- **Intervalo de Pooling:** Configurar a frequência do cron interno (ex: a cada 6h).
- **Lookback Window:** Período de retroatividade na busca de transações (ex: sincronizar sempre os últimos 30 dias).

## 3. Gestão de Dados Operacionais
- **Exportação CSV/JSON:** Interface visual para a funcionalidade de exportação de dados.
- **Backup de Banco:** Botão para download direto do `dev.db` (SQLite).
